export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  getStudyPlan,
  getStudyPlanDocuments,
  listDocuments,
  listProgressions,
  getRecentQuizAttempts,
  getMaxConfusionByDocument,
  getPendingPlanItems,
} from "@/lib/store";
import { utcMidnight } from "@/lib/planner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReadinessLabel = "Critical" | "Weak" | "Developing" | "Strong" | "Exam Ready";

export type TopicReadiness = {
  documentId: string;
  documentTitle: string;
  readinessScore: number;      // 0–100 weighted composite
  readinessLabel: ReadinessLabel;
  factors: {
    completion: number;        // 0–100: sections completed
    quiz: number;              // 0–100: last quiz score (0 if not attempted/locked)
    focus: number;             // 0–100: inverted confusion (5-confusion)/5
    reviews: number;           // 0–100: schedule adherence (overdue items penalty)
    momentum: number;          // 0–100: recency of last activity
  };
  quizScore: number | null;
  completionPct: number;
  confusionLevel: number;
  recentFailures: number;
  weakTopics: string[];
  lastActivityDays: number | null;
  overdueCount: number;
};

export type ExamReadiness = {
  overall: number;
  label: ReadinessLabel;
  daysUntilExam: number;
  topicReadiness: TopicReadiness[];
  labelCounts: Record<ReadinessLabel, number>;
  strongestDoc: string | null;
  weakestDoc: string | null;
  computedAt: number;
};

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function toLabel(score: number): ReadinessLabel {
  if (score <= 30) return "Critical";
  if (score <= 50) return "Weak";
  if (score <= 70) return "Developing";
  if (score <= 85) return "Strong";
  return "Exam Ready";
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// GET /api/planner/[id]/readiness
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await getStudyPlan(params.id, user.id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const now = Date.now();
    const todayMidnight = utcMidnight(now);

    const [planDocs, allDocs, progressions, recentAttempts, pendingItems] =
      await Promise.all([
        getStudyPlanDocuments(params.id),
        listDocuments(user.id),
        listProgressions(user.id),
        getRecentQuizAttempts(user.id, 40), // wider window for per-doc recency
        getPendingPlanItems(params.id),
      ]);

    const docIds = planDocs.map((pd) => pd.documentId);
    const confusionByDoc = await getMaxConfusionByDocument(user.id, docIds);

    const docById = new Map(allDocs.map((d) => [d.id, d]));
    const progByDoc = new Map(progressions.map((p) => [p.documentId, p]));

    // Precompute overdue item counts per document
    const overdueByDoc = new Map<string, number>();
    for (const item of pendingItems) {
      if (!item.completedAt && !item.skippedAt && utcMidnight(item.scheduledDate) < todayMidnight) {
        overdueByDoc.set(item.documentId, (overdueByDoc.get(item.documentId) ?? 0) + 1);
      }
    }

    const topicReadiness: TopicReadiness[] = [];

    for (const pd of planDocs) {
      const doc = docById.get(pd.documentId);
      if (!doc) continue;

      const prog = progByDoc.get(pd.documentId);
      const totalSections = prog?.sectionStatuses.length ?? 0;
      const completedSections = prog?.sectionStatuses.filter((s) => s.completed).length ?? 0;

      // ── Factor 1: Section completion (25%) ─────────────────────────────────
      const completionPct = totalSections > 0
        ? (completedSections / totalSections) * 100
        : 0;
      const completionFactor = clamp(completionPct);

      // ── Factor 2: Quiz performance (30%) ───────────────────────────────────
      const docAttempts = recentAttempts
        .filter((a) => a.documentId === pd.documentId)
        .sort((a, b) => b.completedAt - a.completedAt);

      const lastAttempt = docAttempts[0] ?? null;
      const quizScore = lastAttempt?.score ?? null;
      const quizFactor = prog?.quizUnlocked
        ? clamp(quizScore ?? 0)
        : completionPct < 100
          ? clamp(completionPct * 0.5) // partial credit for sections in progress
          : 0;

      // Recent quiz failures (last 30 days, score < 95)
      const thirtyDaysAgo = now - 30 * 86400000;
      const recentFailures = docAttempts.filter(
        (a) => a.completedAt > thirtyDaysAgo && a.score < 95,
      ).length;

      // Weak topics from most recent failed attempt
      const weakTopics = lastAttempt && lastAttempt.score < 95
        ? lastAttempt.weakTopics.slice(0, 4)
        : [];

      // ── Factor 3: Focus (inverted confusion, 20%) ───────────────────────────
      const confusionLevel = confusionByDoc[pd.documentId] ?? 0;
      const focusFactor = clamp(((5 - confusionLevel) / 5) * 100);

      // ── Factor 4: Review schedule adherence (15%) ──────────────────────────
      const overdueCount = overdueByDoc.get(pd.documentId) ?? 0;
      const reviewFactor = clamp(100 - overdueCount * 20); // -20 per overdue item

      // ── Factor 5: Momentum / recency (10%) ─────────────────────────────────
      let lastActivityDays: number | null = null;
      let momentumFactor = 50; // default: unknown activity = neutral

      if (lastAttempt) {
        lastActivityDays = Math.floor((now - lastAttempt.completedAt) / 86400000);
        if (lastActivityDays <= 2)  momentumFactor = 100;
        else if (lastActivityDays <= 7)  momentumFactor = 85;
        else if (lastActivityDays <= 14) momentumFactor = 65;
        else if (lastActivityDays <= 30) momentumFactor = 40;
        else momentumFactor = 15;
      } else if (completedSections > 0) {
        // No quiz yet but has done sections — moderate momentum
        momentumFactor = 60;
      } else {
        momentumFactor = 20; // never started
      }

      // ── Composite score ─────────────────────────────────────────────────────
      const readinessScore = clamp(
        completionFactor * 0.25 +
        quizFactor       * 0.30 +
        focusFactor      * 0.20 +
        reviewFactor     * 0.15 +
        momentumFactor   * 0.10,
      );

      topicReadiness.push({
        documentId: pd.documentId,
        documentTitle: doc.title,
        readinessScore,
        readinessLabel: toLabel(readinessScore),
        factors: {
          completion: clamp(completionFactor),
          quiz:       clamp(quizFactor),
          focus:      clamp(focusFactor),
          reviews:    clamp(reviewFactor),
          momentum:   clamp(momentumFactor),
        },
        quizScore,
        completionPct: clamp(completionPct),
        confusionLevel,
        recentFailures,
        weakTopics,
        lastActivityDays,
        overdueCount,
      });
    }

    // Sort by readiness ascending (worst first — more actionable view)
    topicReadiness.sort((a, b) => a.readinessScore - b.readinessScore);

    // ── Overall exam readiness ─────────────────────────────────────────────────
    // Priority-weighted average: lower priority number = higher weight
    const totalWeight = planDocs.reduce((sum, pd) => sum + 1 / (pd.priority || 1), 0);
    const weightedSum = topicReadiness.reduce((sum, tr) => {
      const pd = planDocs.find((d) => d.documentId === tr.documentId);
      const weight = 1 / (pd?.priority || 1);
      return sum + tr.readinessScore * weight;
    }, 0);

    const overall = topicReadiness.length > 0
      ? clamp(weightedSum / totalWeight)
      : 0;

    const labelCounts: Record<ReadinessLabel, number> = {
      "Critical": 0, "Weak": 0, "Developing": 0, "Strong": 0, "Exam Ready": 0,
    };
    for (const tr of topicReadiness) labelCounts[tr.readinessLabel]++;

    const daysUntilExam = Math.ceil((plan.examDate - now) / 86400000);

    const readiness: ExamReadiness = {
      overall,
      label: toLabel(overall),
      daysUntilExam,
      topicReadiness,
      labelCounts,
      strongestDoc: topicReadiness.at(-1)?.documentTitle ?? null,
      weakestDoc: topicReadiness[0]?.documentTitle ?? null,
      computedAt: now,
    };

    return NextResponse.json({ readiness });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

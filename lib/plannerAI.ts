// Server-only — never import this file from a "use client" component.
// Use `import type` for the exported types; the hook imports only those.
import { z } from "zod";
import { claude, HAIKU_MODEL } from "./claude";
import {
  getStudyPlan,
  getStudyPlanDocuments,
  getStudyPlanItems,
  getDueReviewEvents,
  listDocuments,
  listProgressions,
  getRecentQuizAttempts,
  getMaxConfusionByDocument,
  getPendingPlanItems,
} from "./store";
import { utcMidnight, addDays } from "./planner";
import type { StudyPlan, StudyPlanDocument, StudyPlanItem, ReviewScheduleEvent, QuizAttempt } from "./types";
import type { DocumentProgression } from "./types";
import type { DocSummary } from "./store";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ReadinessLabelSchema = z.enum(["Critical", "Weak", "Developing", "Strong", "Exam Ready"]);
const BurnoutRiskSchema = z.enum(["low", "moderate", "high"]);
const PaceStatusSchema = z.enum(["behind", "on_track", "ahead"]);

const RecommendationSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  type: z.enum(["reschedule", "focus", "review", "rest", "alert"]),
  title: z.string().max(100),
  body: z.string().max(250),
  documentId: z.string().optional(),
});

const WeakTopicSchema = z.object({
  topic: z.string(),
  severity: z.enum(["critical", "weak", "developing"]),
  documentTitle: z.string().optional(),
});

const TopicReadinessSchema = z.object({
  documentTitle: z.string(),
  documentId: z.string(),
  readinessScore: z.number().min(0).max(100),
  readinessLabel: ReadinessLabelSchema,
  quizScore: z.number().min(0).max(100).nullable(),
  completionPct: z.number().min(0).max(100),
  confusionLevel: z.number().min(0).max(5),
});

export const PlannerAnalysisSchema = z.object({
  readinessScore: z.number().min(0).max(100),
  readinessLabel: ReadinessLabelSchema,
  daysUntilExam: z.number(),
  burnoutRisk: BurnoutRiskSchema,
  paceStatus: PaceStatusSchema,
  recommendations: z.array(RecommendationSchema).max(6),
  weakTopics: z.array(WeakTopicSchema).max(8),
  topicReadiness: z.array(TopicReadinessSchema),
  pacingSuggestion: z.string().max(350),
  motivationalNote: z.string().max(220),
  briefing: z.string().max(550),
});

export type PlannerAnalysis = z.infer<typeof PlannerAnalysisSchema>;
export type ReadinessLabel = z.infer<typeof ReadinessLabelSchema>;

// ─── Context types ────────────────────────────────────────────────────────────

export type PlannerContext = {
  plan: StudyPlan;
  planDocuments: StudyPlanDocument[];
  pendingItems: StudyPlanItem[];           // all uncompleted items
  upcomingItems: StudyPlanItem[];          // next 14 days
  overdueItems: StudyPlanItem[];           // past due date
  docs: DocSummary[];
  progressions: DocumentProgression[];
  recentAttempts: QuizAttempt[];
  confusionByDoc: Record<string, number>;
  dueReviews: ReviewScheduleEvent[];
  now: number;
};

// ─── Context builder (server-side, called from API route) ─────────────────────

export async function buildPlannerContext(planId: string, userId: string): Promise<PlannerContext | null> {
  const plan = await getStudyPlan(planId, userId);
  if (!plan) return null;

  const now = Date.now();
  const todayMidnight = utcMidnight(now);
  const fourteenDaysOut = addDays(todayMidnight, 14);

  const [planDocuments, pendingItems, docs, progressions, recentAttempts, dueReviews] =
    await Promise.all([
      getStudyPlanDocuments(planId),
      getPendingPlanItems(planId),
      listDocuments(userId),
      listProgressions(userId),
      getRecentQuizAttempts(userId, 20),
      getDueReviewEvents(userId, addDays(now, 2 * 86400000)),
    ]);

  const upcomingItems = await getStudyPlanItems(planId, {
    dateFrom: todayMidnight,
    dateTo: fourteenDaysOut,
    includeCompleted: false,
  });

  const overdueItems = pendingItems.filter(
    (i) => !i.completedAt && !i.skippedAt && utcMidnight(i.scheduledDate) < todayMidnight,
  );

  const docIds = [...new Set(pendingItems.map((i) => i.documentId))];
  const confusionByDoc = await getMaxConfusionByDocument(userId, docIds);

  return {
    plan,
    planDocuments,
    pendingItems,
    upcomingItems,
    overdueItems,
    docs,
    progressions,
    recentAttempts,
    confusionByDoc,
    dueReviews,
    now,
  };
}

// ─── Context serializer ───────────────────────────────────────────────────────

function fmt(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function serializePlannerContext(ctx: PlannerContext): string {
  const { plan, planDocuments, overdueItems, upcomingItems, docs, progressions,
    recentAttempts, confusionByDoc, dueReviews, now } = ctx;

  const docById = new Map(docs.map((d) => [d.id, d]));
  const progByDoc = new Map(progressions.map((p) => [p.documentId, p]));

  const daysUntilExam = Math.ceil((plan.examDate - now) / 86400000);
  const examStr = `${fmt(plan.examDate)} (${daysUntilExam > 0 ? `${daysUntilExam} days away` : "PAST"})`;

  const lines: string[] = [
    `STUDY PLAN: "${plan.title}" | Status: ${plan.status}`,
    `EXAM DATE: ${examStr}`,
    `DAILY BUDGET: ${plan.dailyHours}h (${Math.round(plan.dailyHours * 60)}m)`,
    `TODAY: ${fmt(now)}`,
    "",
  ];

  // Document progress
  lines.push(`DOCUMENT PROGRESS (${planDocuments.length} documents):`);
  for (const pd of planDocuments) {
    const doc = docById.get(pd.documentId);
    if (!doc) continue;
    const prog = progByDoc.get(pd.documentId);
    const totalSections = prog?.sectionStatuses.length ?? 0;
    const completedSections = prog?.sectionStatuses.filter((s) => s.completed).length ?? 0;
    const pct = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;
    const confusion = confusionByDoc[pd.documentId] ?? 0;

    // Last quiz attempt for this doc
    const docAttempts = recentAttempts.filter((a) => a.documentId === pd.documentId);
    const lastAttempt = docAttempts[0];
    const quizLine = lastAttempt
      ? `quiz: ${lastAttempt.score}% (${lastAttempt.score >= 95 ? "PASS" : "FAIL"}) on ${fmt(lastAttempt.completedAt)}`
      : "quiz: not attempted";

    lines.push(
      `  - "${doc.title}" [priority ${pd.priority}]`,
      `    sections: ${completedSections}/${totalSections} (${pct}%) | ${quizLine}`,
      `    confusion: ${confusion}/5 | quiz unlocked: ${prog?.quizUnlocked ? "yes" : "no"} | mastered: ${prog?.masteredAt ? "yes" : "no"}`,
    );

    // Weak topics from last failure
    if (lastAttempt && lastAttempt.score < 95 && lastAttempt.weakTopics.length > 0) {
      lines.push(`    weak topics: ${lastAttempt.weakTopics.slice(0, 4).join(", ")}`);
    }
  }

  // Overdue
  lines.push("", `OVERDUE TASKS (${overdueItems.length}):`);
  if (overdueItems.length === 0) {
    lines.push("  none");
  } else {
    for (const item of overdueItems.slice(0, 8)) {
      const doc = docById.get(item.documentId);
      const daysLate = Math.ceil((now - item.scheduledDate) / 86400000);
      lines.push(`  - ${item.itemType.replace("_", " ")} for "${doc?.title ?? item.documentId}" — ${daysLate}d overdue`);
    }
    if (overdueItems.length > 8) lines.push(`  ... and ${overdueItems.length - 8} more`);
  }

  // Upcoming 14 days load
  const upcoming7 = upcomingItems.filter((i) => i.scheduledDate <= addDays(now, 7));
  const totalUpcomingMins = upcomingItems.reduce((a, b) => a + b.estimatedMins, 0);
  lines.push("", `UPCOMING 14 DAYS: ${upcomingItems.length} tasks, ~${totalUpcomingMins}m total`);
  lines.push(`NEXT 7 DAYS: ${upcoming7.length} tasks`);

  // Spaced repetition
  lines.push("", `SPACED REPETITION REVIEWS DUE (next 48h): ${dueReviews.length}`);

  // Recent quiz summary
  const last5 = recentAttempts.slice(0, 5);
  if (last5.length > 0) {
    lines.push("", "RECENT QUIZ HISTORY (newest first):");
    for (const a of last5) {
      const doc = docById.get(a.documentId);
      lines.push(`  - "${doc?.title ?? a.documentId}": ${a.score}% on ${fmt(a.completedAt)} (${a.score >= 95 ? "PASS" : "FAIL"})`);
    }
  }

  // Burnout signals: check if last 7 days had very high load
  const sevenDaysAgo = addDays(now, -7);
  const recentCompleted = ctx.pendingItems.filter(
    (i) => i.completedAt && i.completedAt > sevenDaysAgo,
  );
  const avgDailyMins = Math.round(
    recentCompleted.reduce((a, b) => a + b.estimatedMins, 0) / 7,
  );
  lines.push("", `RECENT ACTIVITY: ~${avgDailyMins}m/day avg (last 7 days, ${recentCompleted.length} tasks completed)`);

  return lines.join("\n");
}

// ─── AI analysis ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an adaptive AI study planner advisor for a medical board exam preparation platform.
Analyze the student's study plan state and return a structured JSON assessment.

Your analysis must be accurate, actionable, and empathetic. Base all scores strictly on the data provided.

READINESS SCORING GUIDE (0–100):
- 0–30 Critical: major gaps, many overdue tasks, quiz failures, high confusion
- 31–50 Weak: some gaps, behind schedule, mixed quiz results
- 51–70 Developing: mostly on track, minor gaps, passing most quizzes
- 71–85 Strong: on schedule, good quiz scores, low confusion
- 86–100 Exam Ready: ahead of schedule, excellent quiz scores, low confusion

BURNOUT DETECTION:
- high: >90m/day recent avg AND many overdue tasks
- moderate: >60m/day OR multiple overdue tasks
- low: otherwise

PACE STATUS:
- behind: overdue tasks > 3 OR completion < expected (days elapsed / total days × 100)
- ahead: overdue tasks = 0 AND upcoming load is light
- on_track: otherwise

BRIEFING: Write 2–4 concise, specific sentences (not generic). Reference actual data: topics, scores, days left.

Respond with ONLY valid JSON matching the exact schema. No markdown, no explanation.`;

const TASK_INSTRUCTION = (contextSummary: string) =>
  `Here is the student's current planner state:\n\n${contextSummary}\n\nAnalyze this data and return a JSON object with these exact fields:
{
  "readinessScore": number (0-100),
  "readinessLabel": "Critical" | "Weak" | "Developing" | "Strong" | "Exam Ready",
  "daysUntilExam": number,
  "burnoutRisk": "low" | "moderate" | "high",
  "paceStatus": "behind" | "on_track" | "ahead",
  "recommendations": [{ "priority": "high"|"medium"|"low", "type": "reschedule"|"focus"|"review"|"rest"|"alert", "title": string, "body": string, "documentId"?: string }],
  "weakTopics": [{ "topic": string, "severity": "critical"|"weak"|"developing", "documentTitle"?: string }],
  "topicReadiness": [{ "documentTitle": string, "documentId": string, "readinessScore": number, "readinessLabel": string, "quizScore": number|null, "completionPct": number, "confusionLevel": number }],
  "pacingSuggestion": string,
  "motivationalNote": string,
  "briefing": string
}`;

export async function analyzePlannerContext(ctx: PlannerContext): Promise<PlannerAnalysis> {
  const contextSummary = serializePlannerContext(ctx);

  const response = await claude.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1800,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: TASK_INSTRUCTION(contextSummary) },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Planner AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return PlannerAnalysisSchema.parse(parsed);
}

// ─── Chat system prompt builder ───────────────────────────────────────────────

export function buildPlannerChatSystemPrompt(ctx: PlannerContext): string {
  const contextSummary = serializePlannerContext(ctx);
  return [
    "You are an adaptive AI study planner advisor for a medical board exam preparation platform.",
    "Answer student questions concisely and specifically, using the data below.",
    "Be direct. Reference actual topics, scores, and dates — not generic advice.",
    "Keep responses to 3–5 sentences unless a list is truly needed.",
    "",
    "CURRENT PLANNER STATE:",
    contextSummary,
  ].join("\n");
}

// ─── Optimization prompt builder ─────────────────────────────────────────────

export const OptimizationSchema = z.object({
  summary: z.string().max(400),
  changes: z.array(z.object({
    type: z.enum(["move", "add_review", "defer", "reprioritize", "remove"]),
    documentTitle: z.string(),
    description: z.string().max(200),
    reason: z.string().max(200),
  })).max(10),
  rescheduleUpdates: z.array(z.object({
    itemId: z.string(),
    newScheduledDate: z.number(),
    reason: z.string().max(120),
  })).max(20),
  priorityAdjustments: z.array(z.object({
    documentId: z.string(),
    newPriority: z.number().min(1).max(10),
    reason: z.string().max(120),
  })).max(6),
  warningsIssued: z.array(z.string().max(160)).max(4),
});

export type OptimizationPlan = z.infer<typeof OptimizationSchema>;

export async function generateOptimizationPlan(ctx: PlannerContext): Promise<OptimizationPlan> {
  const contextSummary = serializePlannerContext(ctx);

  const task = `Here is the student's planner state:\n\n${contextSummary}

Analyze this plan and generate an optimization. Your goal:
- Redistribute overloaded days by moving lower-priority items later
- Surface high-urgency (overdue, quiz-failed, high-confusion) items to the front
- Add retention reviews for topics with low quiz scores or high confusion
- Detect unrealistic pacing and warn when exam date may be insufficient
- Defer flashcard_review and retention_review items when urgent tasks compete

Return ONLY valid JSON with these exact fields:
{
  "summary": string (2-3 sentences explaining the optimization rationale),
  "changes": [{ "type": "move"|"add_review"|"defer"|"reprioritize"|"remove", "documentTitle": string, "description": string, "reason": string }],
  "rescheduleUpdates": [{ "itemId": string, "newScheduledDate": number (unix ms), "reason": string }],
  "priorityAdjustments": [{ "documentId": string, "newPriority": number 1-10, "reason": string }],
  "warningsIssued": [string]
}

Only include rescheduleUpdates for items where you have the actual itemId from the planner state.
Prefer descriptive changes[] over rescheduleUpdates[] when you lack specific item IDs.`;

  const response = await claude.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2000,
    system: [
      "You are an adaptive study schedule optimizer for a medical board exam platform.",
      "Return valid JSON only. No markdown, no explanation outside the JSON.",
    ].join("\n"),
    messages: [{ role: "user", content: task }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Optimizer returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return OptimizationSchema.parse(parsed);
}

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listDocuments, listProgressions, getRecentQuizAttempts } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export type RecommendationType =
  | "retry_quiz"
  | "start_quiz"
  | "continue_reading"
  | "start_reading"
  | "review_weak_topics"
  | "revisit_mastered";

export type Recommendation = {
  type: RecommendationType;
  priority: number;
  documentId: string;
  documentTitle: string;
  reason: string;
  href: string;
  ctaLabel: string;
};

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [docs, progressions, recentAttempts] = await Promise.all([
      listDocuments(user.id),
      listProgressions(user.id),
      getRecentQuizAttempts(user.id, 20),
    ]);

    const progressionByDocId = new Map(progressions.map((p) => [p.documentId, p]));
    const recommendations: Recommendation[] = [];
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const doc of docs) {
      if (!doc.hasReviewer) continue;

      const prog = progressionByDocId.get(doc.id);

      if (!prog) {
        recommendations.push({
          type: "start_reading",
          priority: 3,
          documentId: doc.id,
          documentTitle: doc.title,
          reason: "You haven't started this document yet.",
          href: `/document/${doc.id}`,
          ctaLabel: "Start Reading",
        });
        continue;
      }

      if (prog.remediationActive) {
        recommendations.push({
          type: "retry_quiz",
          priority: 10,
          documentId: doc.id,
          documentTitle: doc.title,
          reason: "Complete remediation to unlock your quiz retry.",
          href: `/document/${doc.id}`,
          ctaLabel: "Resume Remediation",
        });
        continue;
      }

      if (prog.quizUnlocked && !prog.masteredAt) {
        recommendations.push({
          type: "start_quiz",
          priority: 8,
          documentId: doc.id,
          documentTitle: doc.title,
          reason: "You've read all sections — your quiz is unlocked and waiting.",
          href: `/document/${doc.id}`,
          ctaLabel: "Take Quiz",
        });
        continue;
      }

      if (prog.masteredAt) {
        const daysSince = (now - prog.updatedAt) / DAY_MS;
        if (daysSince > 14) {
          recommendations.push({
            type: "revisit_mastered",
            priority: 2,
            documentId: doc.id,
            documentTitle: doc.title,
            reason: `Mastered ${Math.round(daysSince)} days ago — review flashcards to lock in retention.`,
            href: `/document/${doc.id}`,
            ctaLabel: "Review Flashcards",
          });
        }
        continue;
      }

      const completed = prog.sectionStatuses.filter((s) => s.completed).length;
      const total = prog.sectionStatuses.length;

      if (total > 0 && completed > 0 && completed < total) {
        const pct = Math.round((completed / total) * 100);
        recommendations.push({
          type: "continue_reading",
          priority: 6,
          documentId: doc.id,
          documentTitle: doc.title,
          reason: `${pct}% complete — ${total - completed} section${total - completed !== 1 ? "s" : ""} left to unlock the quiz.`,
          href: `/document/${doc.id}`,
          ctaLabel: "Continue",
        });
      } else if (total > 0 && completed === 0) {
        recommendations.push({
          type: "start_reading",
          priority: 3,
          documentId: doc.id,
          documentTitle: doc.title,
          reason: "Start reading to build toward the mastery quiz.",
          href: `/document/${doc.id}`,
          ctaLabel: "Start Reading",
        });
      }
    }

    // Cross-document weak topic insight
    const weakCounts: Record<string, number> = {};
    for (const attempt of recentAttempts) {
      for (const topic of attempt.weakTopics) {
        weakCounts[topic] = (weakCounts[topic] ?? 0) + 1;
      }
    }
    const topWeak = Object.entries(weakCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([t]) => t);

    if (topWeak.length >= 2) {
      recommendations.push({
        type: "review_weak_topics",
        priority: 5,
        documentId: "",
        documentTitle: "Focus Areas",
        reason: `"${topWeak[0]}" and "${topWeak[1]}" keep coming up as weak spots across your quizzes.`,
        href: "/analytics",
        ctaLabel: "View Focus Areas",
      });
    }

    recommendations.sort((a, b) => b.priority - a.priority);
    return NextResponse.json({ recommendations: recommendations.slice(0, 3) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, recommendations: [] }, { status: 500 });
  }
}

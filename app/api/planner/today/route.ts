export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import {
  listStudyPlans,
  listDocuments,
  listProgressions,
  getRecentQuizAttempts,
  getUserPlanItemsInRange,
  getDueReviewEvents,
  getMaxConfusionByDocument,
} from "@/lib/store";
import { buildDailyBrief, utcMidnight, addDays } from "@/lib/planner";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

// GET /api/planner/today — daily study brief across all active plans
export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = Date.now();
    const todayMidnight = utcMidnight(now);
    const thirtyDaysAgo = addDays(todayMidnight, -30);

    // Parallel fetch everything the engine needs
    const [plans, docs, progressions, recentAttempts, allItems, dueReviews] =
      await Promise.all([
        listStudyPlans(user.id),
        listDocuments(user.id),
        listProgressions(user.id),
        getRecentQuizAttempts(user.id, 20),
        getUserPlanItemsInRange(user.id, thirtyDaysAgo, todayMidnight),
        getDueReviewEvents(user.id, addDays(now, DAY_MS)),
      ]);

    // Build lookup maps
    const planTitleById = Object.fromEntries(plans.map((p) => [p.id, p.title]));
    const docTitleById = Object.fromEntries(docs.map((d) => [d.id, d.title]));

    // Fetch confusion levels for the docs that appear in today's items
    const itemDocIds = [...new Set(allItems.map((i) => i.documentId))];
    const confusionByDoc = await getMaxConfusionByDocument(user.id, itemDocIds);

    const brief = buildDailyBrief({
      allItems,
      dueReviews,
      progressions,
      recentAttempts,
      confusionByDoc,
      planTitleById,
      docTitleById,
      now,
    });

    return NextResponse.json({ brief });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

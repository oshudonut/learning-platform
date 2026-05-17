export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  getStudyPlan,
  updateStudyPlanItem,
  createReviewScheduleEvent,
  getStudyPlanItems,
} from "@/lib/store";
import { buildNextReviewEvent, utcMidnight } from "@/lib/planner";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

// GET /api/planner/[id]/items — all items for a plan (optional ?date=YYYY-MM-DD filter)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await getStudyPlan(params.id, user.id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const dateParam = req.nextUrl.searchParams.get("date");
    let dateFrom: number | undefined;
    let dateTo: number | undefined;
    if (dateParam) {
      dateFrom = utcMidnight(new Date(dateParam).getTime());
      dateTo = dateFrom;
    }

    const includeCompleted = req.nextUrl.searchParams.get("includeCompleted") === "true";
    const items = await getStudyPlanItems(plan.id, { dateFrom, dateTo, includeCompleted });
    return NextResponse.json({ items });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// POST /api/planner/[id]/items — item actions: complete | skip | reschedule
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await getStudyPlan(params.id, user.id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const body = await req.json() as {
      action: "complete" | "skip" | "reschedule";
      itemId: string;
      newDate?: number; // UTC ms — required for reschedule
    };

    if (!body.action || !body.itemId) {
      return NextResponse.json({ error: "action and itemId are required" }, { status: 400 });
    }

    if (body.action === "complete") {
      const item = await updateStudyPlanItem(body.itemId, plan.id, {
        completedAt: Date.now(),
      });

      // Schedule next spaced repetition event (non-blocking on error)
      const nextEvent = buildNextReviewEvent(item, user.id, plan.id);
      if (nextEvent) {
        void createReviewScheduleEvent(nextEvent).catch((e) =>
          console.error("[planner/items] createReviewScheduleEvent:", e),
        );
      }

      return NextResponse.json({ item, reviewEventScheduled: Boolean(nextEvent) });
    }

    if (body.action === "skip") {
      const item = await updateStudyPlanItem(body.itemId, plan.id, {
        skippedAt: Date.now(),
      });
      return NextResponse.json({ item });
    }

    if (body.action === "reschedule") {
      if (!body.newDate) {
        return NextResponse.json({ error: "newDate is required for reschedule" }, { status: 400 });
      }
      const scheduledDate = utcMidnight(body.newDate);
      const item = await updateStudyPlanItem(body.itemId, plan.id, { scheduledDate });
      return NextResponse.json({ item });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

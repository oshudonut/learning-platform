export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  getStudyPlan,
  getStudyPlanDocuments,
  getStudyPlanItems,
  getDueReviewEvents,
  updateStudyPlan,
  deleteStudyPlan,
} from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import { utcMidnight, addDays } from "@/lib/planner";

export const runtime = "nodejs";

// GET /api/planner/[id] — fetch plan with documents, items, and due reviews
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

    const [planDocuments, items, dueReviews] = await Promise.all([
      getStudyPlanDocuments(plan.id),
      getStudyPlanItems(plan.id, {
        dateFrom: utcMidnight(Date.now()),
        dateTo: addDays(utcMidnight(Date.now()), 30),
        includeCompleted: false,
      }),
      getDueReviewEvents(user.id, addDays(Date.now(), 1)), // due within next 24h
    ]);

    return NextResponse.json({ plan, planDocuments, items, dueReviews });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// PATCH /api/planner/[id] — update plan metadata
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      title?: string;
      examDate?: number;
      dailyHours?: number;
      status?: "active" | "paused" | "completed" | "archived";
    };

    if (body.examDate !== undefined && body.examDate <= Date.now()) {
      return NextResponse.json({ error: "examDate must be in the future" }, { status: 400 });
    }
    if (body.dailyHours !== undefined) {
      body.dailyHours = Math.max(0.5, Math.min(12, body.dailyHours));
    }

    const plan = await updateStudyPlan(params.id, user.id, body);
    return NextResponse.json({ plan });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// DELETE /api/planner/[id] — delete plan (cascades to items and documents)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const existing = await getStudyPlan(params.id, user.id);
    if (!existing) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    await deleteStudyPlan(params.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

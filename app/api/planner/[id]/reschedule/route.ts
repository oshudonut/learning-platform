export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  getStudyPlan,
  getStudyPlanDocuments,
  getPendingPlanItems,
  bulkReschedulePlanItems,
  updateStudyPlanItem,
  deleteStudyPlanItemsByDocument,
  createStudyPlanItems,
  listDocuments,
  listProgressions,
  updateStudyPlan,
} from "@/lib/store";
import {
  reschedulePendingItems,
  findPullForwardCandidate,
  generatePlanItems,
  utcMidnight,
} from "@/lib/planner";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RescheduleTrigger =
  | "manual"           // user explicitly requested a full reschedule
  | "exam_date_changed" // examDate was updated — full reschedule
  | "quiz_fail"        // quiz failed for a document — rebuild that doc's tasks
  | "pull_forward"     // user finished early — move next item to today
  | "confusion";       // high confusion detected — advance next review for a doc

// POST /api/planner/[id]/reschedule
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
      trigger: RescheduleTrigger;
      documentId?: string;
    };

    const { trigger, documentId } = body;
    if (!trigger) return NextResponse.json({ error: "trigger is required" }, { status: 400 });

    const now = Date.now();
    const planDocs = await getStudyPlanDocuments(plan.id);

    // ── pull_forward: move one upcoming item to today ─────────────────────────
    if (trigger === "pull_forward") {
      const pending = await getPendingPlanItems(plan.id);
      const candidate = findPullForwardCandidate(pending, now);
      if (!candidate) {
        return NextResponse.json({ rescheduledCount: 0, items: [], message: "Nothing to pull forward" });
      }
      const today = utcMidnight(now);
      const item = await updateStudyPlanItem(candidate.id, plan.id, { scheduledDate: today });
      return NextResponse.json({ rescheduledCount: 1, items: [item] });
    }

    // ── confusion: advance the next pending item for the confused document ────
    if (trigger === "confusion") {
      if (!documentId) {
        return NextResponse.json({ error: "documentId is required for confusion trigger" }, { status: 400 });
      }
      const pending = await getPendingPlanItems(plan.id);
      const docItems = pending
        .filter((i) => i.documentId === documentId)
        .sort((a, b) => a.scheduledDate - b.scheduledDate);
      const next = docItems[0];
      if (!next) {
        return NextResponse.json({ rescheduledCount: 0, items: [], message: "No pending items for document" });
      }
      const today = utcMidnight(now);
      if (next.scheduledDate <= today) {
        return NextResponse.json({ rescheduledCount: 0, items: [next], message: "Already scheduled for today" });
      }
      const item = await updateStudyPlanItem(next.id, plan.id, { scheduledDate: today });
      return NextResponse.json({ rescheduledCount: 1, items: [item] });
    }

    // ── quiz_fail: rebuild tasks for the failed document then full reschedule ─
    if (trigger === "quiz_fail") {
      if (!documentId) {
        return NextResponse.json({ error: "documentId is required for quiz_fail trigger" }, { status: 400 });
      }

      // Remove pending items for this document and regenerate from current progression
      await deleteStudyPlanItemsByDocument(plan.id, documentId);

      const [allDocs, allProgressions] = await Promise.all([
        listDocuments(user.id),
        listProgressions(user.id),
      ]);
      const planDoc = planDocs.find((d) => d.documentId === documentId);
      if (planDoc) {
        const doc = allDocs.find((d) => d.id === documentId);
        const prog = allProgressions.filter((p) => p.documentId === documentId);
        if (doc) {
          const newItems = generatePlanItems(plan, [planDoc], [doc], prog);
          await createStudyPlanItems(newItems);
        }
      }
      // Fall through to full reschedule after rebuilding
    }

    // ── Full reschedule (manual, exam_date_changed, or after quiz_fail rebuild)
    const pending = await getPendingPlanItems(plan.id);
    const updates = reschedulePendingItems(pending, plan, planDocs, now);

    const withPlanId = updates.map((u) => ({ ...u, planId: plan.id }));
    await bulkReschedulePlanItems(withPlanId);
    await updateStudyPlan(plan.id, user.id, {}); // bumps updated_at

    // Return refreshed items
    const refreshed = await getPendingPlanItems(plan.id);
    return NextResponse.json({ rescheduledCount: updates.length, items: refreshed });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  getStudyPlan,
  getStudyPlanDocuments,
  addStudyPlanDocument,
  removeStudyPlanDocument,
  updateStudyPlanDocument,
  deleteStudyPlanItemsByDocument,
  createStudyPlanItems,
  listDocuments,
  listProgressions,
} from "@/lib/store";
import { generatePlanItems } from "@/lib/planner";
import { createSupabaseServer } from "@/lib/supabase-server";
import { randomId } from "@/lib/utils";
import type { StudyPlanDocument } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/planner/[id]/documents — add a document or update its settings
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
      documentId?: string;
      priority?: number;
      weakTopicWeight?: number;
      paused?: boolean;
    };

    if (!body.documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // Verify ownership
    const allDocs = await listDocuments(user.id);
    const doc = allDocs.find((d) => d.id === body.documentId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const existing = await getStudyPlanDocuments(plan.id);
    const alreadyIn = existing.find((d) => d.documentId === body.documentId);

    if (alreadyIn) {
      // Update existing entry
      await updateStudyPlanDocument(alreadyIn.id, {
        priority: body.priority,
        weakTopicWeight: body.weakTopicWeight,
        paused: body.paused,
      });
      return NextResponse.json({ ok: true, updated: true });
    }

    // Add new document
    const now = Date.now();
    const planDoc: StudyPlanDocument = {
      id: randomId(),
      planId: plan.id,
      documentId: body.documentId,
      priority: body.priority ?? (existing.length + 1),
      weakTopicWeight: body.weakTopicWeight ?? 1.0,
      paused: body.paused ?? false,
      addedAt: now,
    };

    await addStudyPlanDocument(planDoc);

    // Generate items for the newly added document
    const progressions = await listProgressions(user.id);
    const newItems = generatePlanItems(plan, [planDoc], [doc], progressions.filter((p) => p.documentId === body.documentId));
    await createStudyPlanItems(newItems);

    return NextResponse.json({ planDocument: planDoc, newItems }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// DELETE /api/planner/[id]/documents — remove a document from the plan
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await getStudyPlan(params.id, user.id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const body = await req.json() as { documentId?: string };
    if (!body.documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    await deleteStudyPlanItemsByDocument(plan.id, body.documentId);
    await removeStudyPlanDocument(plan.id, body.documentId);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

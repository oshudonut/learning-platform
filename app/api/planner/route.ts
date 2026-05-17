export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  listStudyPlans,
  createStudyPlan,
  addStudyPlanDocument,
  createStudyPlanItems,
  listDocuments,
  listProgressions,
} from "@/lib/store";
import { generatePlanItems } from "@/lib/planner";
import { createSupabaseServer } from "@/lib/supabase-server";
import { randomId } from "@/lib/utils";
import type { StudyPlan, StudyPlanDocument } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/planner — list all non-archived plans for the user
export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plans = await listStudyPlans(user.id);
    return NextResponse.json({ plans });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

// POST /api/planner — create a new plan with auto-generated items
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      title?: string;
      examDate?: number;
      dailyHours?: number;
      documentIds?: string[];
      priorities?: Record<string, number>;      // documentId → priority (1-based)
      weakTopicWeights?: Record<string, number>; // documentId → weight multiplier
    };

    if (!body.examDate || !body.documentIds?.length) {
      return NextResponse.json({ error: "examDate and documentIds are required" }, { status: 400 });
    }

    if (body.examDate <= Date.now()) {
      return NextResponse.json({ error: "examDate must be in the future" }, { status: 400 });
    }

    const dailyHours = Math.max(0.5, Math.min(12, body.dailyHours ?? 2));

    // Verify user owns all requested documents
    const allDocs = await listDocuments(user.id);
    const ownedIds = new Set(allDocs.map((d) => d.id));
    const unowned = body.documentIds.filter((id) => !ownedIds.has(id));
    if (unowned.length > 0) {
      return NextResponse.json({ error: `Documents not found: ${unowned.join(", ")}` }, { status: 404 });
    }

    const now = Date.now();
    const planId = randomId();

    const plan: StudyPlan = {
      id: planId,
      userId: user.id,
      title: body.title ?? "Study Plan",
      examDate: body.examDate,
      dailyHours,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    const planDocs: StudyPlanDocument[] = body.documentIds.map((docId, i) => ({
      id: randomId(),
      planId,
      documentId: docId,
      priority: body.priorities?.[docId] ?? i + 1,
      weakTopicWeight: body.weakTopicWeights?.[docId] ?? 1.0,
      paused: false,
      addedAt: now,
    }));

    // Fetch progressions for the selected documents
    const allProgressions = await listProgressions(user.id);
    const relevantProgressions = allProgressions.filter((p) =>
      body.documentIds!.includes(p.documentId),
    );
    const relevantDocs = allDocs.filter((d) => body.documentIds!.includes(d.id));

    const items = generatePlanItems(plan, planDocs, relevantDocs, relevantProgressions);

    // Persist everything
    await createStudyPlan(plan);
    await Promise.all(planDocs.map((pd) => addStudyPlanDocument(pd)));
    await createStudyPlanItems(items);

    return NextResponse.json({ plan, planDocuments: planDocs, items }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

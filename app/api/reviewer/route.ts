import { NextRequest, NextResponse } from "next/server";
import { generateStructured, compressDocumentForReview } from "@/lib/claude";
import { REVIEWER_TASK, SYSTEM_PREAMBLE, getMethodologyConfig } from "@/lib/prompts";
import { getDocument, updateDocument, computeContentHash, getProgression, upsertProgression } from "@/lib/store";
import { buildInitialProgression } from "@/lib/progression";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  ReviewerSchema,
  ConceptualReviewerSchema,
  RetrievalReviewerSchema,
  MemoryReviewerSchema,
  RelationalReviewerSchema,
} from "@/lib/types";
import type { LearningMethod, StudyMode, ReviewerSchemaType, DocumentProgression } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const SCHEMA_MAP = {
  standard: ReviewerSchema,
  conceptual: ConceptualReviewerSchema,
  retrieval: RetrievalReviewerSchema,
  memory: MemoryReviewerSchema,
  relational: RelationalReviewerSchema,
} as const satisfies Record<ReviewerSchemaType, unknown>;

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, force, learningMethod, studyMode } = (await req.json()) as {
      id?: string;
      force?: boolean;
      learningMethod?: LearningMethod;
      studyMode?: StudyMode;
    };
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const doc = await getDocument(id, user.id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.reviewer && !force) {
      return NextResponse.json({ reviewer: doc.reviewer, cached: true, cacheSource: "stored" });
    }

    const incomingHash = computeContentHash(doc.text);

    if (!force && doc.contentHash === incomingHash && doc.reviewer) {
      return NextResponse.json({ reviewer: doc.reviewer, cached: true, cacheSource: "hash" });
    }

    const compressed = compressDocumentForReview(doc.text);

    let resolvedMethod = learningMethod;
    let resolvedMode = studyMode;
    if (!resolvedMethod || !resolvedMode) {
      const progression = await getProgression(id, user.id);
      resolvedMethod = resolvedMethod ?? progression?.learningMethod ?? undefined;
      resolvedMode = resolvedMode ?? progression?.studyMode ?? undefined;
    }

    let taskInstruction = REVIEWER_TASK;
    let systemPreamble = SYSTEM_PREAMBLE;
    let schemaType: ReviewerSchemaType = "standard";

    if (resolvedMethod && resolvedMode) {
      const config = getMethodologyConfig(resolvedMethod, resolvedMode);
      taskInstruction = config.taskInstruction;
      systemPreamble = config.systemPreamble;
      schemaType = config.schemaType;
    }

    const schema = SCHEMA_MAP[schemaType];

    const { parsed, cacheReadTokens, cacheWriteTokens } = await generateStructured({
      schema,
      systemPreamble,
      documentText: doc.text,
      compressedText: compressed,
      taskInstruction,
      maxTokens: schemaType === "standard" ? 8000 : 12000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDocument(id, user.id, { reviewer: parsed as any, contentHash: incomingHash });

    // Reset learning cycle when regenerating with an explicit methodology.
    // Error-recovery retries (force=true, no learningMethod in request) are excluded —
    // those didn't produce a new reviewer on the previous attempt, so progress is still valid.
    let progressionReset = false;
    let freshProgression: DocumentProgression | undefined;
    if (force && learningMethod) {
      const topicCount = ((parsed as { topics?: unknown[] }).topics?.length) ?? 0;
      const prev = await getProgression(id, user.id);
      const fresh = buildInitialProgression(id, topicCount);
      // Carry forward method selections from this request
      fresh.learningMethod = resolvedMethod ?? null;
      fresh.studyMode = resolvedMode ?? null;
      // Preserve mastery history and document identity, reset everything else
      if (prev) {
        fresh.masteredAt = prev.masteredAt;
        fresh.createdAt = prev.createdAt;
      }
      await upsertProgression(fresh);
      progressionReset = true;
      // Return the fresh progression directly so the client can apply it without
      // a follow-up GET — avoids rebuildSectionStatuses restoring old completed state.
      freshProgression = fresh;
    }

    return NextResponse.json({
      reviewer: parsed,
      cached: false,
      schemaType,
      progressionReset,
      freshProgression,
      usage: { cacheReadTokens, cacheWriteTokens },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reviewer] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

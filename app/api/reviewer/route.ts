import { NextRequest, NextResponse } from "next/server";
import { generateStructured, compressDocumentForReview } from "@/lib/claude";
import { REVIEWER_TASK, SYSTEM_PREAMBLE, getMethodologyConfig, buildAnchorInstruction } from "@/lib/prompts";
import { getDocument, updateDocument, computeContentHash, getDocumentByContentHash, getProgression, upsertProgression, markHighlightsStale, saveStudyTransformation, listTransformationHistory } from "@/lib/store";
import { buildInitialProgression } from "@/lib/progression";
import { createSupabaseServer } from "@/lib/supabase-server";
import { buildTranscriptContext, buildPageIndex } from "@/lib/transformation-service";
import { randomId } from "@/lib/utils";
import { fireEvent, ANALYTICS_EVENTS } from "@/lib/analytics-events";
import type { StudyTransformation } from "@/lib/types";
import {
  ReviewerSchema,
  ConceptualReviewerSchema,
  RetrievalReviewerSchema,
  MemoryReviewerSchema,
  RelationalReviewerSchema,
} from "@/lib/types";
import type { LearningMethod, StudyMode, ReviewerSchemaType, DocumentProgression } from "@/lib/types";
import { MODEL } from "@/lib/claude";

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
      // Return latest transformation metadata alongside cached reviewer for history/meta surface
      const [latestTransformation] = await listTransformationHistory(id, user.id, 1).catch(() => []);
      return NextResponse.json({
        reviewer: doc.reviewer,
        cached: true,
        cacheSource: "stored",
        transformation: latestTransformation ?? null,
      });
    }

    const incomingHash = computeContentHash(doc.text);

    if (!force && doc.contentHash === incomingHash && doc.reviewer) {
      const [latestTransformation] = await listTransformationHistory(id, user.id, 1).catch(() => []);
      return NextResponse.json({
        reviewer: doc.reviewer,
        cached: true,
        cacheSource: "hash",
        transformation: latestTransformation ?? null,
      });
    }

    fireEvent(ANALYTICS_EVENTS.TRANSFORMATION_STARTED, {
      documentId: id,
      learningMethod,
      studyMode,
    });

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

    // Use transcript as source when available — derive reviewer from structured pages,
    // not raw upload text. Falls back to doc.text for pre-Phase-3 documents.
    let documentText: string;
    let compressedText: string | undefined;
    if (doc.transcript) {
      documentText = buildTranscriptContext(doc.transcript);
      const pageIndex = buildPageIndex(doc.transcript);
      taskInstruction = taskInstruction + buildAnchorInstruction(pageIndex);
    } else {
      documentText = doc.text;
      compressedText = compressDocumentForReview(doc.text);
    }

    const schema = SCHEMA_MAP[schemaType];

    const startTime = Date.now();
    const { parsed, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = await generateStructured({
      schema,
      systemPreamble,
      documentText,
      compressedText,
      taskInstruction,
      maxTokens: schemaType === "standard" ? 8000 : 12000,
    });
    const generationTimeMs = Date.now() - startTime;

    // Guard against legacy hash collision: docs uploaded before the fix may have
    // content_hash = null. If another doc already carries this hash for this user,
    // save the reviewer without stamping the hash to avoid the unique constraint.
    // For docs uploaded after the fix the hash is already set at upload time and
    // this check will find the same doc (id === existingByHash.id), so it's a no-op.
    const existingByHash = await getDocumentByContentHash(incomingHash, user.id).catch(() => null);
    const hashPatch = (!existingByHash || existingByHash.id === id)
      ? { contentHash: incomingHash }
      : {}; // another doc owns this hash — skip stamping to avoid violation

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDocument(id, user.id, { reviewer: parsed as any, ...hashPatch });

    // Record in study_transformations for history/cost tracking (best-effort)
    let savedTransformation: StudyTransformation | null = null;
    try {
      const transcriptVersion = doc.transcript?.meta.version ?? 1;
      const transformationType =
        schemaType === "conceptual" ? "conceptual" as const
        : schemaType === "retrieval" ? "active_recall" as const
        : "reviewer" as const;
      const t: StudyTransformation = {
        id: randomId(),
        documentId: id,
        userId: user.id,
        transcriptVersion,
        transformationType,
        learningMethod: resolvedMethod ?? null,
        studyMode: resolvedMode ?? null,
        schemaType,
        generatedAt: startTime,
        model: MODEL,
        generationTimeMs,
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        cacheReadTokens,
        cacheWriteTokens,
        estimatedCostUsd:
          ((inputTokens ?? 0) * 3 + (outputTokens ?? 0) * 15 + cacheReadTokens * 0.30 + cacheWriteTokens * 3.75)
          / 1_000_000,
        sourceAnchors: [],
        metadata: { fromTranscript: Boolean(doc.transcript), viaLegacyRoute: true },
        content: parsed as StudyTransformation["content"],
        supersededBy: null,
        createdAt: startTime,
      };
      await saveStudyTransformation(t);
      savedTransformation = t;
      fireEvent(ANALYTICS_EVENTS.TRANSFORMATION_COMPLETED, {
        documentId: id,
        transformationType,
        generationTimeMs,
        estimatedCostUsd: t.estimatedCostUsd,
      });
    } catch {
      // Non-fatal — transformation record is supplementary
    }

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
      // Mark existing highlights stale so the UI can signal them to the user
      await markHighlightsStale(id, user.id);
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
      transformation: savedTransformation,
      usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reviewer] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getDocument, updateDocument } from "@/lib/store";
import { generateTransformation } from "@/lib/transformation-service";
import { fireEvent, ANALYTICS_EVENTS } from "@/lib/analytics-events";
import type { LearningMethod, StudyMode, StudyTransformationType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      documentId?: string;
      transformationType?: StudyTransformationType;
      learningMethod?: LearningMethod;
      studyMode?: StudyMode;
      force?: boolean;
    };

    const { documentId, transformationType, learningMethod, studyMode, force } = body;

    if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    if (!transformationType) return NextResponse.json({ error: "Missing transformationType" }, { status: 400 });

    // Flashcards and quiz go through their dedicated routes
    if (transformationType === "flashcards" || transformationType === "quiz") {
      return NextResponse.json(
        { error: `Use /api/${transformationType} for this type` },
        { status: 400 },
      );
    }

    const doc = await getDocument(documentId, user.id);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    if (force) {
      fireEvent(ANALYTICS_EVENTS.REGENERATION_TRIGGERED, {
        documentId,
        transformationType,
        learningMethod,
        studyMode,
      });
    } else {
      fireEvent(ANALYTICS_EVENTS.TRANSFORMATION_STARTED, {
        documentId,
        transformationType,
        learningMethod,
        studyMode,
      });
    }

    const { transformation, cached } = await generateTransformation({
      doc,
      transformationType,
      learningMethod,
      studyMode,
      userId: user.id,
      force,
    });

    // Mirror reviewer-type content back to documents.reviewer for backward compat.
    // This keeps ReviewerView, progression, and export routes unaware of the transformation layer.
    const isReviewerType =
      transformationType === "reviewer" ||
      transformationType === "conceptual" ||
      transformationType === "active_recall" ||
      transformationType === "rapid_recall";

    if (isReviewerType && !cached) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateDocument(documentId, user.id, { reviewer: transformation.content as any });
    }

    if (cached) {
      fireEvent(ANALYTICS_EVENTS.TRANSFORMATION_CACHE_HIT, {
        documentId,
        transformationType,
      });
    } else {
      fireEvent(ANALYTICS_EVENTS.TRANSFORMATION_COMPLETED, {
        documentId,
        transformationType,
        generationTimeMs: transformation.generationTimeMs,
        estimatedCostUsd: transformation.estimatedCostUsd,
      });
    }

    return NextResponse.json({
      transformation,
      cached,
      usage: {
        inputTokens: transformation.inputTokens,
        outputTokens: transformation.outputTokens,
        cacheReadTokens: transformation.cacheReadTokens,
        cacheWriteTokens: transformation.cacheWriteTokens,
        estimatedCostUsd: transformation.estimatedCostUsd,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transformation] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

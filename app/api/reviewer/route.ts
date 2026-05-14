import { NextRequest, NextResponse } from "next/server";
import { generateStructured, compressDocumentForReview } from "@/lib/claude";
import { REVIEWER_TASK, SYSTEM_PREAMBLE, getMethodologyConfig } from "@/lib/prompts";
import { getDocument, updateDocument, computeContentHash, getProgression } from "@/lib/store";
import {
  ReviewerSchema,
  ConceptualReviewerSchema,
  RetrievalReviewerSchema,
  MemoryReviewerSchema,
  RelationalReviewerSchema,
} from "@/lib/types";
import type { LearningMethod, StudyMode, ReviewerSchemaType } from "@/lib/types";

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
    const { id, force, learningMethod, studyMode } = (await req.json()) as {
      id?: string;
      force?: boolean;
      learningMethod?: LearningMethod;
      studyMode?: StudyMode;
    };
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const doc = await getDocument(id);
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
      const progression = await getProgression(id);
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
      maxTokens: schemaType === "standard" ? 3000 : 3500,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDocument(id, { reviewer: parsed as any, contentHash: incomingHash });

    return NextResponse.json({
      reviewer: parsed,
      cached: false,
      schemaType,
      usage: { cacheReadTokens, cacheWriteTokens },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reviewer] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

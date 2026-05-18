import { generateStructured, MODEL } from "./claude";
import {
  SYSTEM_PREAMBLE,
  REVIEWER_TASK,
  RAPID_RECALL_TASK,
  buildAnchorInstruction,
  getMethodologyConfig,
} from "./prompts";
import {
  getCachedStudyTransformation,
  saveStudyTransformation,
  markTransformationSuperseded,
  listTransformationHistory,
} from "./store";
import { randomId } from "./utils";
import type {
  Document,
  StudyTransformation,
  StudyTransformationType,
  LearningMethod,
  StudyMode,
  RawTranscript,
  ReviewerSchemaType,
} from "./types";
import {
  ReviewerSchema,
  ConceptualReviewerSchema,
  RetrievalReviewerSchema,
  MemoryReviewerSchema,
  RelationalReviewerSchema,
  RapidRecallReviewerSchema,
  METHOD_SCHEMA_MAP,
} from "./types";

// ─── Transcript context builders ─────────────────────────────────────────────

export function buildTranscriptContext(transcript: RawTranscript): string {
  return transcript.pages
    .filter((p) => !p.empty && p.content.trim().length > 0)
    .map((p) => `[${p.id}]\n${p.content}`)
    .join("\n\n");
}

export function buildPageIndex(transcript: RawTranscript): string {
  return transcript.pages
    .filter((p) => !p.empty)
    .map((p) => {
      const preview = p.content.replace(/\s+/g, " ").slice(0, 100);
      return `${p.id}: ${p.title} — ${preview}…`;
    })
    .join("\n");
}

// ─── Schema map ───────────────────────────────────────────────────────────────

const REVIEWER_SCHEMA_MAP = {
  standard: ReviewerSchema,
  conceptual: ConceptualReviewerSchema,
  retrieval: RetrievalReviewerSchema,
  memory: MemoryReviewerSchema,
  relational: RelationalReviewerSchema,
} as const satisfies Record<ReviewerSchemaType, unknown>;

// ─── Cost calculation (approximate, Sonnet pricing) ──────────────────────────

function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  return (
    inputTokens * 3 / 1_000_000 +
    outputTokens * 15 / 1_000_000 +
    cacheReadTokens * 0.30 / 1_000_000 +
    cacheWriteTokens * 3.75 / 1_000_000
  );
}

// ─── Prompt config ────────────────────────────────────────────────────────────

type PromptConfig = {
  taskInstruction: string;
  systemPreamble: string;
  schemaType: ReviewerSchemaType | "rapid_recall";
  maxTokens: number;
};

function getPromptConfig(
  transformationType: StudyTransformationType,
  learningMethod: LearningMethod | undefined,
  studyMode: StudyMode | undefined,
  pageIndex: string | null,
): PromptConfig {
  const anchorSuffix = pageIndex ? buildAnchorInstruction(pageIndex) : "";

  if (transformationType === "rapid_recall") {
    return {
      taskInstruction: RAPID_RECALL_TASK + anchorSuffix,
      systemPreamble: SYSTEM_PREAMBLE,
      schemaType: "rapid_recall",
      maxTokens: 4000,
    };
  }

  // For reviewer-type transforms, use the existing methodology config when
  // method + mode are provided; fall back to board-exam standard otherwise.
  if (learningMethod && studyMode) {
    const config = getMethodologyConfig(learningMethod, studyMode);
    return {
      taskInstruction: config.taskInstruction + anchorSuffix,
      systemPreamble: config.systemPreamble,
      schemaType: config.schemaType,
      maxTokens: config.schemaType === "standard" ? 8000 : 12000,
    };
  }

  return {
    taskInstruction: REVIEWER_TASK + anchorSuffix,
    systemPreamble: SYSTEM_PREAMBLE,
    schemaType: "standard",
    maxTokens: 8000,
  };
}

// ─── Main generation function ─────────────────────────────────────────────────

export type GenerateTransformationParams = {
  doc: Document;
  transformationType: StudyTransformationType;
  learningMethod?: LearningMethod;
  studyMode?: StudyMode;
  userId: string;
  force?: boolean;
};

export async function generateTransformation(
  params: GenerateTransformationParams,
): Promise<{ transformation: StudyTransformation; cached: boolean }> {
  const { doc, transformationType, learningMethod, studyMode, userId, force } = params;
  const transcriptVersion = doc.transcript?.meta.version ?? 1;

  // Cache check
  if (!force) {
    const cached = await getCachedStudyTransformation({
      documentId: doc.id,
      userId,
      transformationType,
      learningMethod: learningMethod ?? null,
      studyMode: studyMode ?? null,
      transcriptVersion,
    });
    if (cached) return { transformation: cached, cached: true };
  }

  // Build document context — prefer transcript when available
  const documentText = doc.transcript
    ? buildTranscriptContext(doc.transcript)
    : doc.text;

  const pageIndex = doc.transcript ? buildPageIndex(doc.transcript) : null;

  // Get prompt config
  const { taskInstruction, systemPreamble, schemaType, maxTokens } = getPromptConfig(
    transformationType,
    learningMethod,
    studyMode,
    pageIndex,
  );

  // Select schema
  const schema =
    schemaType === "rapid_recall"
      ? RapidRecallReviewerSchema
      : REVIEWER_SCHEMA_MAP[schemaType];

  const startTime = Date.now();
  const { parsed, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } =
    await generateStructured({
      schema,
      systemPreamble,
      documentText,
      taskInstruction,
      maxTokens,
    });

  const generationTimeMs = Date.now() - startTime;
  const estimatedCostUsd = estimateCostUsd(
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  );

  const transformation: StudyTransformation = {
    id: randomId(),
    documentId: doc.id,
    userId,
    transcriptVersion,
    transformationType,
    learningMethod: learningMethod ?? null,
    studyMode: studyMode ?? null,
    schemaType: schemaType === "rapid_recall" ? "rapid_recall" : schemaType,
    generatedAt: startTime,
    model: MODEL,
    generationTimeMs,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    estimatedCostUsd,
    sourceAnchors: [],
    metadata: { fromTranscript: Boolean(doc.transcript) },
    content: parsed as StudyTransformation["content"],
    supersededBy: null,
    createdAt: startTime,
  };

  await saveStudyTransformation(transformation);

  // Mark any previous non-superseded transformations of this type as superseded
  if (force) {
    const history = await listTransformationHistory(doc.id, userId, 10);
    for (const prev of history) {
      if (
        prev.id !== transformation.id &&
        prev.transformationType === transformationType &&
        prev.learningMethod === (learningMethod ?? null) &&
        prev.studyMode === (studyMode ?? null) &&
        prev.supersededBy === null
      ) {
        await markTransformationSuperseded(prev.id, transformation.id);
      }
    }
  }

  return { transformation, cached: false };
}

// Re-export METHOD_SCHEMA_MAP for use in the route
export { METHOD_SCHEMA_MAP };

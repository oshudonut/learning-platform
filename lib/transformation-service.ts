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

// ─── Source anchor collection and validation ─────────────────────────────────
//
// Extracts per-topic sourceAnchors from generated content, validates pageIds
// against the transcript page set, and deduplicates.
// Returns the cleaned anchor list + debug counts.
// Generation is never blocked — an empty result is always valid.

import type { SourceAnchor } from "./types";

type AnchorCollection = {
  anchors: SourceAnchor[];
  invalidCount: number;         // anchors discarded due to unknown pageId
  topicsMissingAnchors: number; // topics/drillSets that emitted no anchors
};

function collectAndValidateAnchors(
  content: StudyTransformation["content"],
  validPageIds: Set<string> | null,
): AnchorCollection {
  const raw: SourceAnchor[] = [];
  let topicsMissingAnchors = 0;

  // Reviewer-type families — have .topics[]
  if ("topics" in content && Array.isArray(content.topics)) {
    for (const topic of content.topics as Array<{ sourceAnchors?: SourceAnchor[] }>) {
      if (topic.sourceAnchors && topic.sourceAnchors.length > 0) {
        raw.push(...topic.sourceAnchors);
      } else {
        topicsMissingAnchors++;
      }
    }
  }

  // Rapid recall — has .drillSets[]; items may carry sourceAnchors if schema expands
  if ("drillSets" in content && Array.isArray(content.drillSets)) {
    for (const ds of content.drillSets as Array<{
      sourceAnchors?: SourceAnchor[];
      items?: Array<{ sourceAnchors?: SourceAnchor[] }>;
    }>) {
      const dsAnchors = ds.sourceAnchors ?? [];
      const itemAnchors = (ds.items ?? []).flatMap((item) => item.sourceAnchors ?? []);
      const combined = [...dsAnchors, ...itemAnchors];
      if (combined.length > 0) {
        raw.push(...combined);
      } else {
        topicsMissingAnchors++;
      }
    }
  }

  // Validate pageIds and deduplicate
  let invalidCount = 0;
  const seen = new Set<string>();
  const anchors: SourceAnchor[] = [];

  for (const anchor of raw) {
    if (!anchor.pageId) continue;
    const key = `${anchor.pageId}::${anchor.sectionId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (validPageIds && !validPageIds.has(anchor.pageId)) {
      invalidCount++;
      console.warn(`[anchor] invalid pageId "${anchor.pageId}" discarded (not in transcript index)`);
      continue;
    }
    anchors.push(anchor);
  }

  return { anchors, invalidCount, topicsMissingAnchors };
}

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

  // Collect, validate, and deduplicate source anchors from generated content
  const validPageIds = doc.transcript
    ? new Set(doc.transcript.pages.map((p) => p.id))
    : null;
  const { anchors, invalidCount, topicsMissingAnchors } = collectAndValidateAnchors(
    parsed as StudyTransformation["content"],
    validPageIds,
  );

  // Debug logging — anchor emission quality per generation
  if (process.env.NODE_ENV !== "production") {
    console.log("[anchor-debug]", {
      transformationType,
      anchorCount: anchors.length,
      invalidCount,
      topicsMissingAnchors,
      fromTranscript: Boolean(doc.transcript),
    });
  }

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
    sourceAnchors: anchors,
    metadata: { fromTranscript: Boolean(doc.transcript), anchorCount: anchors.length },
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

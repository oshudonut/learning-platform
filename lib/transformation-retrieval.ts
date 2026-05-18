// Server-side retrieval abstraction for study transformations.
// Single entry point used by all routes that need transformation content.
// Eliminates the dual-path confusion between /api/reviewer and /api/transformation.

import {
  getCachedStudyTransformation,
  listTransformationHistory,
} from "./store";
import type {
  StudyTransformation,
  StudyTransformationType,
  LearningMethod,
  StudyMode,
} from "./types";

export type TransformationSource =
  | "transformation_table"   // found in study_transformations
  | "stale_transformation"   // found but transcript version is older
  | "not_found";             // no transformation exists for these params

export type TransformationRetrievalResult = {
  transformation: StudyTransformation | null;
  source: TransformationSource;
  isStale: boolean;
};

/**
 * Retrieve the most recent matching transformation, with staleness detection.
 *
 * Order of precedence:
 *   1. Exact match (documentId + type + method + mode + currentTranscriptVersion)
 *   2. Version-mismatched row (same type/method/mode, older transcriptVersion) → isStale = true
 *   3. Most recent transformation of any type for this document → isStale = true
 *   4. not_found
 */
export async function getLatestTransformation(params: {
  documentId: string;
  userId: string;
  transformationType?: StudyTransformationType;
  learningMethod?: LearningMethod | null;
  studyMode?: StudyMode | null;
  currentTranscriptVersion: number;
}): Promise<TransformationRetrievalResult> {
  const { documentId, userId, currentTranscriptVersion } = params;
  const transformationType = params.transformationType ?? "reviewer";

  // 1. Exact cache hit (current transcript version)
  const exact = await getCachedStudyTransformation({
    documentId,
    userId,
    transformationType,
    learningMethod: params.learningMethod ?? null,
    studyMode: params.studyMode ?? null,
    transcriptVersion: currentTranscriptVersion,
  }).catch(() => null);

  if (exact) {
    return { transformation: exact, source: "transformation_table", isStale: false };
  }

  // 2. Stale match: same type/method/mode, any version
  const history = await listTransformationHistory(documentId, userId, 20).catch(() => [] as StudyTransformation[]);
  const activeHistory = history.filter((t) => t.supersededBy === null);

  const staleMatch = activeHistory.find(
    (t) =>
      t.transformationType === transformationType &&
      (t.learningMethod ?? null) === (params.learningMethod ?? null) &&
      (t.studyMode ?? null) === (params.studyMode ?? null),
  );

  if (staleMatch) {
    const isStale = staleMatch.transcriptVersion < currentTranscriptVersion;
    return {
      transformation: staleMatch,
      source: "stale_transformation",
      isStale,
    };
  }

  // 3. Most recent transformation of any type (different type/method — still stale)
  const mostRecent = activeHistory[0] ?? null;
  if (mostRecent) {
    return {
      transformation: mostRecent,
      source: "stale_transformation",
      isStale: mostRecent.transcriptVersion < currentTranscriptVersion,
    };
  }

  return { transformation: null, source: "not_found", isStale: false };
}

/**
 * Retrieve a transformation by ID.
 * Used when the client specifies a particular historical transformation to load.
 */
export async function getTransformationById(
  id: string,
  userId: string,
  documentId: string,
): Promise<StudyTransformation | null> {
  const history = await listTransformationHistory(documentId, userId, 50).catch(() => [] as StudyTransformation[]);
  return history.find((t) => t.id === id) ?? null;
}

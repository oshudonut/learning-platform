// ─── Mastery Engine ───────────────────────────────────────────────────────────
//
// Lightweight heuristic mastery estimation — Phase 4 initial implementation.
// Derives per-topic mastery from quiz accuracy, flashcard quality, and
// interaction signals. No ML, no DB writes. Pure function composition.
//
// Mastery levels (monotone, low → high):
//   unfamiliar → emerging → understood → mastered
//   struggling  (lateral — implies recent regression, not just low familiarity)

import type { LearningSignal } from "./learning-signals";
import type { QuizAttempt, FlashcardSession } from "./types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type MasteryLevel =
  | "unfamiliar"  // no meaningful interaction yet or consistently wrong
  | "emerging"    // some exposure, partial recall
  | "understood"  // reliable recall, few errors
  | "mastered"    // consistently correct, high quiz score, low confusion
  | "struggling"; // explicitly flagged weak by quiz, or high confusion score

export type TopicMasterySnapshot = {
  topicId: string;
  canonicalTopicId?: string; // stable identity — preferred over topicId for longitudinal tracking
  masteryLevel: MasteryLevel;
  confidenceScore: number;  // 0.0–1.0 blended heuristic score
  lastUpdated: number;
  _factors?: MasteryFactors; // only populated in dev mode
};

export type DocumentMasteryContext = {
  documentId: string;
  topics: TopicMasterySnapshot[];
  weakTopics: string[];      // struggling | unfamiliar topic IDs
  strongTopics: string[];    // mastered topic IDs
  averageConfidence: number; // 0–1 mean confidenceScore across topics
  computedAt: number;
};

export type TutorGroundingContext = {
  weakTopics: string[];
  recentConfusion: Array<{ topicId: string; confusionLevel: number }>;
  failedQuizConcepts: string[];
  recommendedFocus: string[];
  transcriptAnchorHints: string[]; // pageIds linked to weak topic anchors
};

// Internal — exposed only in dev mode via _factors
type MasteryFactors = {
  quizScore: number;        // 0–1 accuracy for this topic
  flashcardScore: number;   // 0–1 normalised SM-2 quality
  confusionPenalty: number; // 0–1 penalty from confusion signals
  sourceUsagePenalty: number; // 0–1 high source-panel usage → struggling signal
  tutorUsagePenalty: number;  // 0–1 repeated tutor questions → struggling signal
  revisitPenalty: number;     // 0–1 session revisit frequency
};

// ─── Numeric helpers ──────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// Map blended score to mastery level using calibrated thresholds.
function scoreToLevel(score: number): MasteryLevel {
  if (score >= 0.88) return "mastered";
  if (score >= 0.68) return "understood";
  if (score >= 0.42) return "emerging";
  return "unfamiliar";
}

// ─── Quiz-based score extraction ─────────────────────────────────────────────

// Returns 0.5 (neutral prior) when no quiz data is available.
function quizScoreForTopic(topicId: string, attempts: QuizAttempt[]): number {
  if (attempts.length === 0) return 0.5;
  // Weight the 3 most recent attempts; older data decays implicitly
  const recent = attempts.slice(-3);
  const avg = recent.reduce((sum, a) => sum + a.score / 100, 0) / recent.length;
  return clamp01(avg);
}

function isWeakInQuiz(topicId: string, attempts: QuizAttempt[]): boolean {
  // At least one recent attempt explicitly flags this topic as weak
  return attempts.slice(-3).some((a) =>
    a.weakTopics.some((wt) => wt.toLowerCase().includes(topicId.toLowerCase())),
  );
}

// ─── Flashcard-based score extraction ────────────────────────────────────────

// Returns 0.5 (neutral prior) when no flashcard data is available.
function flashcardScore(sessions: FlashcardSession[]): number {
  if (sessions.length === 0) return 0.5;
  const recent = sessions.slice(-3);
  const avg = recent.reduce((sum, s) => sum + s.avgQuality, 0) / recent.length;
  return clamp01(avg / 5); // SM-2 quality scale is 0–5
}

// ─── Signal-based factor extraction ──────────────────────────────────────────

function signalFactors(
  topicId: string,
  signals: LearningSignal[],
): Pick<MasteryFactors, "confusionPenalty" | "sourceUsagePenalty" | "tutorUsagePenalty" | "revisitPenalty"> {
  // Match signals by topicId OR by topicName in metadata (for cross-signal compatibility)
  const forTopic = signals.filter(
    (s) =>
      s.topicId === topicId ||
      (typeof s.metadata?.topicName === "string" &&
        s.metadata.topicName.toLowerCase().includes(topicId.toLowerCase())),
  );

  // Confusion penalty: average confusion level from note_confusion_level signals
  const confusionSignals = forTopic.filter(s => s.signalType === "note_confusion_level");
  const confusionPenalty =
    confusionSignals.length > 0
      ? clamp01(
          confusionSignals.reduce(
            (sum, s) => sum + ((s.metadata?.confusionLevel as number) ?? 0) / 5,
            0,
          ) / confusionSignals.length,
        )
      : 0;

  // Source panel opens: frequent opens suggest the learner needs the source to understand
  const sourceOpens = forTopic.filter(s => s.signalType === "source_opened").length;
  const sourceUsagePenalty = clamp01(sourceOpens / 5); // 5+ opens = max penalty

  // Repeated tutor questions on this topic suggest confusion
  const tutorQuestions = forTopic.filter(s => s.signalType === "tutor_question").length;
  const tutorUsagePenalty = clamp01(tutorQuestions / 4); // 4+ = max penalty

  // Revisit frequency: more than 3 revisits in a session signals struggle
  const revisits = forTopic.filter(s => s.signalType === "topic_viewed").length;
  const revisitPenalty = revisits > 3 ? clamp01((revisits - 3) / 8) : 0;

  return { confusionPenalty, sourceUsagePenalty, tutorUsagePenalty, revisitPenalty };
}

// ─── Per-topic mastery computation ───────────────────────────────────────────

export function computeTopicMastery(
  topicId: string,
  {
    quizAttempts = [],
    flashcardSessions = [],
    signals = [],
  }: {
    quizAttempts?: QuizAttempt[];
    flashcardSessions?: FlashcardSession[];
    signals?: LearningSignal[];
  },
): TopicMasterySnapshot {
  const t0 = performance.now();

  const qScore = quizScoreForTopic(topicId, quizAttempts);
  const fcScore = flashcardScore(flashcardSessions);
  const { confusionPenalty, sourceUsagePenalty, tutorUsagePenalty, revisitPenalty } =
    signalFactors(topicId, signals);
  const weak = isWeakInQuiz(topicId, quizAttempts);

  // Weighted blend — quiz accuracy is the primary signal
  const raw = clamp01(
    qScore            * 0.40 +
    fcScore           * 0.28 +
    (1 - confusionPenalty)   * 0.16 +
    (1 - sourceUsagePenalty) * 0.08 +
    (1 - tutorUsagePenalty)  * 0.08,
  );

  const adjusted = clamp01(raw - revisitPenalty * 0.08);

  // If explicitly flagged as a weak topic in quiz output → always "struggling"
  const level: MasteryLevel = weak ? "struggling" : scoreToLevel(adjusted);

  if (process.env.NODE_ENV !== "production") {
    const elapsed = Math.round(performance.now() - t0);
    if (elapsed > 10) {
      console.warn("[mastery-engine] slow recompute", { topicId, elapsedMs: elapsed });
    }
  }

  const factors: MasteryFactors = {
    quizScore: qScore,
    flashcardScore: fcScore,
    confusionPenalty,
    sourceUsagePenalty,
    tutorUsagePenalty,
    revisitPenalty,
  };

  return {
    topicId,
    masteryLevel: level,
    confidenceScore: +adjusted.toFixed(4),
    lastUpdated: Date.now(),
    _factors: process.env.NODE_ENV !== "production" ? factors : undefined,
  };
}

// ─── Document-level mastery context ──────────────────────────────────────────

export function computeDocumentMastery(
  documentId: string,
  topicIds: string[],
  inputs: {
    quizAttempts?: QuizAttempt[];
    flashcardSessions?: FlashcardSession[];
    signals?: LearningSignal[];
  },
): DocumentMasteryContext {
  const topics = topicIds.map((id) => computeTopicMastery(id, inputs));

  const weakTopics = topics
    .filter((s) => s.masteryLevel === "struggling" || s.masteryLevel === "unfamiliar")
    .map((s) => s.topicId);

  const strongTopics = topics
    .filter((s) => s.masteryLevel === "mastered")
    .map((s) => s.topicId);

  const averageConfidence =
    topics.length > 0
      ? +( topics.reduce((sum, s) => sum + s.confidenceScore, 0) / topics.length ).toFixed(4)
      : 0;

  return {
    documentId,
    topics,
    weakTopics,
    strongTopics,
    averageConfidence,
    computedAt: Date.now(),
  };
}

// ─── Tutor grounding context ──────────────────────────────────────────────────
//
// Prepares a context bundle for future tutor integration.
// Called server-side before streaming a tutor response — NOT used by UI yet.

export function buildTutorGroundingContext(
  masteryContext: DocumentMasteryContext,
  signals: LearningSignal[],
  quizAttempts: QuizAttempt[],
): TutorGroundingContext {
  // Most recent confusion events (last 10, descending)
  const recentConfusion = signals
    .filter((s) => s.signalType === "note_confusion_level" && s.topicId)
    .slice(-10)
    .map((s) => ({
      topicId: s.topicId!,
      confusionLevel: (s.metadata?.confusionLevel as number) ?? 0,
    }));

  // Topics explicitly flagged weak in quiz output
  const failedQuizConcepts = [
    ...new Set(quizAttempts.flatMap((a) => a.weakTopics)),
  ].slice(0, 6);

  // Recommended focus: weak mastery first, then recently confused
  const recentlyConfusedIds = new Set(recentConfusion.map((c) => c.topicId));
  const recommendedFocus = [
    ...masteryContext.weakTopics,
    ...[...recentlyConfusedIds].filter((id) => !masteryContext.weakTopics.includes(id)),
  ].slice(0, 5);

  // Transcript anchor hints: pageIds from source_opened signals on weak topics
  const transcriptAnchorHints = signals
    .filter(
      (s) =>
        s.signalType === "source_opened" &&
        s.topicId &&
        masteryContext.weakTopics.includes(s.topicId),
    )
    .map((s) => s.metadata?.targetPageId as string | undefined)
    .filter((id): id is string => typeof id === "string")
    .filter((id, i, arr) => arr.indexOf(id) === i) // deduplicate
    .slice(0, 8);

  return {
    weakTopics: masteryContext.weakTopics,
    recentConfusion,
    failedQuizConcepts,
    recommendedFocus,
    transcriptAnchorHints,
  };
}

// ─── Dev diagnostics ─────────────────────────────────────────────────────────

// Returns topic IDs that have an unusually high signal volume — may indicate
// a feedback loop or event storm that needs debouncing.
export function detectNoisyTopics(
  signals: LearningSignal[],
  threshold = 12,
): string[] {
  if (process.env.NODE_ENV === "production") return [];
  const counts = new Map<string, number>();
  for (const s of signals) {
    if (!s.topicId) continue;
    counts.set(s.topicId, (counts.get(s.topicId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);
}

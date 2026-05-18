import { randomId } from "./utils";

// ─── Signal type registry ─────────────────────────────────────────────────────

export type SignalType =
  | "topic_viewed"           // user enters a reviewer topic section
  | "source_opened"          // SourceEvidencePanel expanded for a topic
  | "flashcard_correct"      // flashcard rated quality ≥ 4 (SM-2)
  | "flashcard_incorrect"    // flashcard rated quality ≤ 1
  | "quiz_correct"           // quiz question answered correctly
  | "quiz_incorrect"         // quiz question answered incorrectly
  | "tutor_question"         // user sends a message in AI tutor
  | "note_created"           // note saved in WorkspacePanel
  | "note_confusion_level"   // confusion slider updated
  | "rapid_recall_completed" // user finishes a rapid-recall drill set
  | "review_regenerated"     // user triggers reviewer regeneration
  | "transcript_navigation"; // user navigates from source panel to transcript

// ─── Core signal shape ────────────────────────────────────────────────────────

export type LearningSignal = {
  id: string;
  userId: string;
  documentId: string;
  topicId?: string;           // topic title slug or "topic_{index}" — stable within a transformation
  transformationId?: string;  // StudyTransformation.id that produced this signal
  signalType: SignalType;
  confidence?: number;        // 0–1 reliability of the signal
  durationMs?: number;        // time actively engaged with this content
  metadata?: Record<string, unknown>; // signal-specific payload — NO raw text, NO PII
  createdAt: number;
};

// Factory — ensures id + createdAt are always set
export function createSignal(
  partial: Omit<LearningSignal, "id" | "createdAt">,
): LearningSignal {
  return { id: randomId(), createdAt: Date.now(), ...partial };
}

// ─── Signal metadata shapes ───────────────────────────────────────────────────
// These define exactly what goes in metadata per signal type.
// Used for documentation and type-safe callsites — never store raw text.

export type TopicViewedMeta = {
  topicIndex: number;
  topicTitle: string;    // for display only — matched to topicId by consumer
  revisitCount?: number;
};

export type SourceOpenedMeta = {
  topicIndex: number;
  anchorCount: number;   // total anchors available
  resolvedCount: number; // anchors successfully resolved
};

export type FlashcardResultMeta = {
  cardIndex: number;
  quality: number;       // SM-2 quality 0–5
  intervalDays: number;  // next review interval
  isRetry: boolean;      // whether this is a same-session retry
};

export type QuizResultMeta = {
  questionIndex: number;
  questionType: string;
  topicName: string;
  difficulty: string;
  attemptNumber: number; // 1 = first attempt, 2+ = retry
};

export type TutorQuestionMeta = {
  messageIndex: number;
  questionLength: number; // character count only — no content
  hasDocumentContext: boolean;
};

export type NoteCreatedMeta = {
  topicIndex: number;
  hasText: boolean;   // presence flag only — no content stored
  wordCount?: number; // approximate word count for signal strength
};

export type NoteConfusionMeta = {
  topicIndex: number;
  confusionLevel: number; // 0–5 from WorkspacePanel slider
  previousLevel?: number;
};

export type RapidRecallCompletedMeta = {
  drillSetIndex: number;
  drillSetTopic: string;
  itemCount: number;
  revealedCount: number;
  completedInMs: number;
};

export type ReviewRegeneratedMeta = {
  fromPreset: string;
  reason: "stale" | "explicit" | "method_change";
  previousTransformationId?: string;
};

export type TranscriptNavigationMeta = {
  targetPageId: string;
  triggeredBy: "source_panel" | "manual";
  sourceTopicId?: string;
};

import { z } from "zod";

// ─── Source Anchors ───────────────────────────────────────────────────────────
//
// Placeholder — not yet populated by generation pipelines.
// Prepared so reviewer schemas already accept the field when implementation ships.
// Purpose: every reviewer insight will eventually link back to a transcript page/section,
// enabling highlight anchoring, tutor citations, flashcard traceability, and audit.

export const SourceAnchorSchema = z.object({
  pageId: z.string(),              // e.g. "page_12"
  sectionId: z.string().optional(), // e.g. "page_12_section_3"
  quotedText: z.string().optional(), // short verbatim excerpt for display/verification
});

export type SourceAnchor = z.infer<typeof SourceAnchorSchema>;

// ─── Reviewer (Board-Exam Optimized) ──────────────────────────────────────────

export const ConfusedWithSchema = z.object({
  item: z.string(),
  distinction: z.string(),
});

// Phase 4: canonical identity fields — injected post-generation, not by Claude
const topicIdentityFields = {
  canonicalTopicId: z.string().optional(),  // "<slug>--<fingerprint8>"
  topicFingerprint: z.string().optional(),  // 8-char hex hash
};

export const ReviewerTopicSchema = z.object({
  title: z.string(),
  coreIdea: z.string(),
  keyPoints: z.array(z.string()),
  quickBreakdown: z.array(z.string()),
  mustMemorize: z.array(z.string()),
  confusedWith: z.array(ConfusedWithSchema).optional(),
  boardTips: z.array(z.string()),
  quickRecall: z.array(z.string()),
  sourceAnchors: z.array(SourceAnchorSchema).optional(),
  ...topicIdentityFields,
});

export const MnemonicSchema = z.object({
  concept: z.string(),
  aid: z.string(),
});

export const ReviewerSchema = z.object({
  title: z.string(),
  summary: z.string(),
  topics: z.array(ReviewerTopicSchema).min(3).max(6),
  globalMustMemorize: z.array(z.string()),
  mnemonics: z.array(MnemonicSchema),
});

export type ConfusedWith = z.infer<typeof ConfusedWithSchema>;
export type ReviewerTopic = z.infer<typeof ReviewerTopicSchema>;
export type Reviewer = z.infer<typeof ReviewerSchema>;

// ─── Adaptive Reviewer Schema Families ───────────────────────────────────────

// Conceptual: Feynman, Elaboration, Multisensory
export const ConceptualTopicSchema = z.object({
  title: z.string(),
  analogy: z.string(),
  simplifiedExplanation: z.string(),
  mechanism: z.array(z.string()),
  keyTakeaways: z.array(z.string()),
  selfCheck: z.array(z.string()),
  sourceAnchors: z.array(SourceAnchorSchema).optional(),
  ...topicIdentityFields,
});
export const ConceptualReviewerSchema = z.object({
  type: z.literal("conceptual"),
  title: z.string(),
  summary: z.string(),
  topics: z.array(ConceptualTopicSchema).min(3).max(6),
  bigPicture: z.string(),
});
export type ConceptualTopic = z.infer<typeof ConceptualTopicSchema>;
export type ConceptualReviewer = z.infer<typeof ConceptualReviewerSchema>;

// Retrieval: Active Recall, Blurting, SQ3R, PQ4R
export const RetrievalQuestionSchema = z.object({
  q: z.string(),
  hint: z.string().optional(),
  answer: z.string(),
});
export const RetrievalTopicSchema = z.object({
  title: z.string(),
  blurtPrompt: z.string(),
  questions: z.array(RetrievalQuestionSchema),
  keyFacts: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  sourceAnchors: z.array(SourceAnchorSchema).optional(),
  ...topicIdentityFields,
});
export const RetrievalReviewerSchema = z.object({
  type: z.literal("retrieval"),
  title: z.string(),
  summary: z.string(),
  topics: z.array(RetrievalTopicSchema).min(3).max(6),
  finalChallenge: z.array(z.string()),
});
export type RetrievalQuestion = z.infer<typeof RetrievalQuestionSchema>;
export type RetrievalTopic = z.infer<typeof RetrievalTopicSchema>;
export type RetrievalReviewer = z.infer<typeof RetrievalReviewerSchema>;

// Memory: Mnemonic, Spaced Repetition, Leitner
export const MemoryAnchorSchema = z.object({
  fact: z.string(),
  anchor: z.string(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reviewIn: z.string().optional(),
});
export const MemoryAssociationSchema = z.object({
  concept: z.string(),
  trick: z.string(),
});
export const MemoryTopicSchema = z.object({
  title: z.string(),
  coreIdea: z.string(),
  anchors: z.array(MemoryAnchorSchema),
  associations: z.array(MemoryAssociationSchema),
  sourceAnchors: z.array(SourceAnchorSchema).optional(),
  ...topicIdentityFields,
});
export const MemoryReviewerSchema = z.object({
  type: z.literal("memory"),
  title: z.string(),
  summary: z.string(),
  topics: z.array(MemoryTopicSchema).min(3).max(6),
  masterAnchors: z.array(MemoryAnchorSchema),
});
export type MemoryAnchor = z.infer<typeof MemoryAnchorSchema>;
export type MemoryTopic = z.infer<typeof MemoryTopicSchema>;
export type MemoryReviewer = z.infer<typeof MemoryReviewerSchema>;

// Relational: Mind Maps, Interleaving
export const ConceptNodeSchema = z.object({
  concept: z.string(),
  children: z.array(z.string()),
  relatedTopics: z.array(z.string()),
});
export const RelationalTopicSchema = z.object({
  title: z.string(),
  centralConcept: z.string(),
  nodes: z.array(ConceptNodeSchema),
  crossLinks: z.array(z.object({ from: z.string(), via: z.string(), to: z.string() })),
  contrastsWith: z.array(z.object({ topic: z.string(), keyDifference: z.string() })),
  sourceAnchors: z.array(SourceAnchorSchema).optional(),
  ...topicIdentityFields,
});
export const RelationalReviewerSchema = z.object({
  type: z.literal("relational"),
  title: z.string(),
  summary: z.string(),
  topics: z.array(RelationalTopicSchema).min(3).max(6),
  conceptMap: z.array(z.object({ from: z.string(), relationship: z.string(), to: z.string() })),
});
export type RelationalTopic = z.infer<typeof RelationalTopicSchema>;
export type RelationalReviewer = z.infer<typeof RelationalReviewerSchema>;

export type AnyReviewer =
  | Reviewer
  | ConceptualReviewer
  | RetrievalReviewer
  | MemoryReviewer
  | RelationalReviewer;

// RapidRecallReviewer is intentionally NOT in AnyReviewer — it has a different
// structure (drillSets instead of topics) and is rendered by RapidRecallView,
// not ReviewerView. Access it via StudyTransformation.content.

export type ReviewerSchemaType = "standard" | "conceptual" | "retrieval" | "memory" | "relational";

export const METHOD_SCHEMA_MAP: Record<LearningMethod, ReviewerSchemaType> = {
  feynman: "conceptual",
  active_recall: "retrieval",
  spaced_repetition: "memory",
  blurting: "retrieval",
  mind_maps: "relational",
  mnemonic: "memory",
  interleaving: "relational",
  elaboration: "conceptual",
  sq3r: "retrieval",
  pq4r: "retrieval",
  leitner: "memory",
  pomodoro: "standard",
  multisensory: "conceptual",
};

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export const QuizQuestionSchema = z.object({
  question: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string(),
});

export const QuizSchema = z.object({
  questions: z.array(QuizQuestionSchema),
});

// ─── Extended Quiz Schemas (typed question variants) ──────────────────────────

const difficulty = z.enum(["easy", "medium", "hard"]);

// Phase 4: mastery metadata shared across all quiz question types
const quizMasteryFields = {
  sourceTopicId: z.string().optional(),
  masteryWeight: z.number().optional(),
  difficultyEstimate: z.number().optional(),
};

const MultipleChoiceQuestionSchema = z.object({
  type: z.literal("multiple_choice"),
  question: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
  difficulty,
  topic: z.string(),
  ...quizMasteryFields,
});

const TrueFalseQuestionSchema = z.object({
  type: z.literal("true_false"),
  question: z.string(),
  correctAnswer: z.boolean(),
  explanation: z.string(),
  difficulty,
  topic: z.string(),
  ...quizMasteryFields,
});

const IdentificationQuestionSchema = z.object({
  type: z.literal("identification"),
  question: z.string(),
  correctAnswer: z.string(),
  acceptableVariants: z.array(z.string()).optional(),
  explanation: z.string(),
  difficulty,
  topic: z.string(),
  ...quizMasteryFields,
});

const FillInTheBlankQuestionSchema = z.object({
  type: z.literal("fill_in_the_blank"),
  question: z.string(),
  template: z.string(),
  correctAnswer: z.string(),
  acceptableVariants: z.array(z.string()).optional(),
  explanation: z.string(),
  difficulty,
  topic: z.string(),
  ...quizMasteryFields,
});

export const ExtendedQuizQuestionSchema = z.discriminatedUnion("type", [
  MultipleChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  IdentificationQuestionSchema,
  FillInTheBlankQuestionSchema,
]);

export const ExtendedQuizSchema = z.object({
  questions: z.array(ExtendedQuizQuestionSchema),
  difficultyLevel: z.string().optional(),
});

export type Quiz = z.infer<typeof QuizSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

// ─── Flashcards ───────────────────────────────────────────────────────────────

export const FlashcardSchema = z.object({
  front: z.string(),
  back: z.string(),
  hint: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string(),
  // Phase 4 mastery metadata — optional, not yet populated by generation pipeline
  sourceTopicId: z.string().optional(),    // stable topic identifier for mastery tracking
  masteryWeight: z.number().optional(),    // 0–1 relative importance for mastery scoring
  difficultyEstimate: z.number().optional(), // 0–1 estimated difficulty beyond enum
});

export const FlashcardsSchema = z.object({
  cards: z.array(FlashcardSchema),
});

export type Flashcard = z.infer<typeof FlashcardSchema>;
export type Flashcards = z.infer<typeof FlashcardsSchema>;

// ─── Flashcard review state (SM-2) ────────────────────────────────────────────

export type FlashcardReviewState = {
  cardIndex: number;
  interval: number;      // days until next review
  easeFactor: number;    // 2.5 default
  repetitions: number;   // how many times reviewed
  nextReview: number;    // timestamp
  lastQuality: number;   // 0–5 last review quality
};

// ─── Conversation (Tutor) ─────────────────────────────────────────────────────

export type TutorMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type Conversation = {
  id: string;
  documentId: string | null;
  documentTitle: string | null;
  messages: TutorMessage[];
  createdAt: number;
  updatedAt: number;
};

// ─── Analytics ────────────────────────────────────────────────────────────────

export type QuizAttempt = {
  quizId: string;
  documentId: string;
  documentTitle: string;
  score: number;           // 0–100
  totalQuestions: number;
  correctAnswers: number;
  weakTopics: string[];
  completedAt: number;
};

export type FlashcardSession = {
  documentId: string;
  documentTitle: string;
  cardsStudied: number;
  avgQuality: number;      // 0–5
  completedAt: number;
};

export type Analytics = {
  quizAttempts: QuizAttempt[];
  flashcardSessions: FlashcardSession[];
  studyStreak: number;
  lastStudied: number | null;
  totalStudyTime: number;   // minutes
};

// ─── Text chunks ──────────────────────────────────────────────────────────────

export type TextChunk = {
  index: number;
  content: string;
  wordCount: number;
};

// ─── Learning Profile ─────────────────────────────────────────────────────────

export type LearningMethod =
  | "feynman"
  | "active_recall"
  | "spaced_repetition"
  | "blurting"
  | "mind_maps"
  | "mnemonic"
  | "interleaving"
  | "elaboration"
  | "sq3r"
  | "pq4r"
  | "leitner"
  | "pomodoro"
  | "multisensory";

export type StudyMode = "cram" | "conceptual" | "board_exam" | "mastery";

// ─── Mastery Progression ──────────────────────────────────────────────────────

export type QuizDifficultyLevel = "beginner" | "intermediate" | "advanced" | "board_exam" | "extreme_recall";

export type ReviewerSectionStatus = {
  sectionIndex: number;
  completed: boolean;
  completedAt: number | null;
};

export type CheckpointStatus = {
  checkpointIndex: number;   // 0–4
  sectionsCovered: number[]; // which topic indices this checkpoint covers
  flashcardsGenerated: boolean;
  completed: boolean;
  completedAt: number | null;
};

export type DocumentProgression = {
  documentId: string;
  sectionStatuses: ReviewerSectionStatus[];
  checkpointStatuses: CheckpointStatus[];
  quizUnlocked: boolean;
  masteredAt: number | null;
  currentDifficultyLevel: QuizDifficultyLevel;
  remediationActive: boolean;
  remediationCompletedAt: number | null;
  currentSectionIndex: number;
  flashcardChallengeCompleted: boolean;
  learningMethod: LearningMethod | null;
  studyMode: StudyMode | null;
  createdAt: number;
  updatedAt: number;
};

export type OpenAnswerGradeResult = {
  correct: boolean;
  confidence: "high" | "medium" | "low";
  feedback: string;
};

// ─── Extended Quiz Question Types ─────────────────────────────────────────────

export type QuizQuestionType = "multiple_choice" | "true_false" | "identification" | "fill_in_the_blank";

export type MultipleChoiceQuestion = {
  type: "multiple_choice";
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
};

export type TrueFalseQuestion = {
  type: "true_false";
  question: string;
  correctAnswer: boolean;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
};

export type IdentificationQuestion = {
  type: "identification";
  question: string;
  correctAnswer: string;
  acceptableVariants?: string[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
};

export type FillInTheBlankQuestion = {
  type: "fill_in_the_blank";
  question: string;
  template: string;
  correctAnswer: string;
  acceptableVariants?: string[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
};

export type ExtendedQuizQuestion = MultipleChoiceQuestion | TrueFalseQuestion | IdentificationQuestion | FillInTheBlankQuestion;

export type ExtendedQuiz = {
  questions: ExtendedQuizQuestion[];
  difficultyLevel: QuizDifficultyLevel;
};

// ─── Rapid Recall — cram-mode drill schema (Phase 5) ─────────────────────────

export const RapidRecallItemSchema = z.object({
  cue: z.string(),
  response: z.string(),
  flag: z.enum(["MUST_KNOW", "HIGH_YIELD", "STANDARD"]),
  sourceAnchors: z.array(SourceAnchorSchema).optional(),
});
export const RapidRecallDrillSetSchema = z.object({
  topic: z.string(),
  items: z.array(RapidRecallItemSchema).min(3).max(15),
  ...topicIdentityFields,
});
export const RapidRecallReviewerSchema = z.object({
  type: z.literal("rapid_recall"),
  title: z.string(),
  summary: z.string(),
  drillSets: z.array(RapidRecallDrillSetSchema).min(2).max(8),
});
export type RapidRecallItem = z.infer<typeof RapidRecallItemSchema>;
export type RapidRecallDrillSet = z.infer<typeof RapidRecallDrillSetSchema>;
export type RapidRecallReviewer = z.infer<typeof RapidRecallReviewerSchema>;

// ─── Raw Transcript (Layer 0 — immutable source data) ────────────────────────
//
// Page-scoped verbatim extraction. One TranscriptPage per source page/section.
// Never modified after creation. Reviewer is derived FROM this, never the reverse.
//
// TranscriptMeta.sourceType values:
//   "pdf"          — true per-page extraction via pdfjs pagerender callback (Phase 3)
//   "docx"         — heading-delimited sections (no physical page concept in DOCX)
//   "image"        — single page from OCR vision extraction
//   "reconstructed"— built from documents.text for pre-Phase-3 uploads where
//                    the original file was already deleted; section boundaries are
//                    Claude-identified structural splits, not source file pages

// ── Transcript status / extraction method enums ───────────────────────────────

// Document-level processing state machine — persisted as a DB column so it
// survives refresh and is queue-compatible. Distinct from TranscriptStatus
// (transcript-internal quality flag) and from DocumentProgression.
export type TranscriptProcessingStatus =
  | "none"        // transcript has never been attempted
  | "pending"     // uploaded, waiting for a worker to claim it
  | "queued"      // enqueued for async generation (future)
  | "processing"  // generation actively in progress
  | "completed"   // transcript exists and is usable
  | "failed";     // generation failed with no recoverable content

export type TranscriptStatus = "pending" | "processing" | "completed" | "failed";

export type TranscriptExtractionMethod =
  | "pdfjs-per-page"       // Phase 3: true per-page via pdfjs pagerender
  | "claude-ocr-per-page"  // Phase 3: per-page Claude vision OCR
  | "mammoth-sections"     // Phase 3: DOCX heading-delimited sections
  | "image-ocr"            // Single image Claude vision OCR
  | "claude-boundary"      // Phase 2: Claude identifies boundaries, server slices verbatim
  | "single-page";         // Fallback: entire doc.text as one section

// ── Transcript metadata ───────────────────────────────────────────────────────
//
// Stored alongside pages. Enables analytics, retries, billing, and debugging.
// Cost fields are approximate and model-specific; label as estimates at callsites.

export type TranscriptMeta = {
  status: TranscriptStatus;
  version: number;               // schema version; starts at 1; increment on re-extraction
  sourceType: "pdf" | "docx" | "image" | "reconstructed";
  extractionMethod: TranscriptExtractionMethod;
  generatedAt: number;           // unix ms timestamp
  processingTimeMs: number;      // wall-clock ms from start to DB write
  pageCount: number;             // pages.length
  tokenCount: number;            // inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens
  inputTokens: number;           // uncached prompt tokens
  cacheReadTokens: number;       // tokens served from Anthropic prompt cache
  cacheWriteTokens: number;      // tokens written to Anthropic prompt cache
  outputTokens: number;
  estimatedCostUsd: number;      // approximate; based on Sonnet pricing at generation time
  cached: boolean;               // true when Anthropic prompt cache was hit (cacheReadTokens > 0)
  failedReason: string | null;
};

// ── Page and section types ────────────────────────────────────────────────────

export type TranscriptSection = {
  id: string;        // "page_{pageNumber}_section_{sectionIndex}" — 1-indexed, stable within version
  heading: string;   // exact heading text from source
  content: string;   // verbatim section body
  level: number;     // 1 = top-level, 2 = subsection, 3 = minor
};

export type TranscriptPage = {
  id: string;              // "page_{pageNumber}" — stable within a transcript version
  pageNumber: number;      // 1-indexed
  title: string;           // exact heading from source, or "Section N" if absent
  rawText: string;         // verbatim extraction — unmodified from source (OCR output, pdfjs text, etc.)
  content: string;         // working content; identical to rawText in Phase 2;
                           // may differ if OCR cleaning is applied in later phases
  sections: TranscriptSection[];
  charCount: number;       // content.length at extraction time
  // Quality flags — set at extraction; used for OCR scoring and UI warnings
  empty: boolean;          // <10 non-whitespace chars (cover pages, blank scans)
  lowConfidence: boolean;  // OCR quality may be unreliable (Phase 3+ OCR; false for reconstructed)
  malformed: boolean;      // structural anomaly detected (Phase 3+ OCR; false for reconstructed)
  ocrSource: boolean;      // true when extracted via Claude vision OCR
};

export type RawTranscript = {
  meta: TranscriptMeta;
  pages: TranscriptPage[];
};

// ─── Transcript boundary detection schemas (Claude output for reconstruction) ─
//
// Claude identifies section start positions only — never reproduces content.
// The server slices doc.text at identified positions to build verbatim pages.

export const TranscriptBoundarySchema = z.object({
  title: z.string(),       // exact title/heading text — copied char-for-char from source
  startMarker: z.string(), // first 60 chars of section body (fallback locator if title not found)
  level: z.number().int().min(1).max(3),
});

export const TranscriptBoundariesOutputSchema = z.object({
  sections: z.array(TranscriptBoundarySchema).min(1),
});

export type TranscriptBoundary = z.infer<typeof TranscriptBoundarySchema>;

// ─── Document ─────────────────────────────────────────────────────────────────

export type Document = {
  id: string;
  title: string;
  filename: string;
  text: string;
  textLength: number;
  contentHash?: string;
  createdAt: number;
  userId?: string | null;
  folderId?: string | null;
  workspaceId?: string | null;
  transcript?: RawTranscript;        // Layer 0 — immutable verbatim source; absent on pre-Phase-3 docs
  transcriptStatus?: TranscriptProcessingStatus; // document-level state machine; defaults to "none"
  lastAttemptAt?: number | null;     // epoch ms of last generation attempt; null if never attempted
  retryCount?: number;               // queue retry counter; managed by workers, not service functions
  storageKey?: string | null;        // temp-uploads path; set for OCR-deferred uploads, cleared after processing
  lastError?: string | null;         // error message from the most recent failed processing attempt
  processingCompletedAt?: number | null; // epoch ms when status became completed or failed
  reviewer?: AnyReviewer;            // Layer 2 — derived transform; generated on user request
  quiz?: Quiz;
  flashcards?: Flashcard[];
  flashcardReviewStates?: FlashcardReviewState[];
  chunks?: TextChunk[];
};

// ─── Study Transformations (Phase 5) ─────────────────────────────────────────
//
// Each generated study artifact is a StudyTransformation row.
// Stored in study_transformations table; NOT in documents JSONB columns.
// Reviewer-type transforms are also mirrored to documents.reviewer for
// backward compat with ReviewerView and DocumentProgression.

export type StudyTransformationType =
  | "reviewer"       // board-exam standard schema
  | "rapid_recall"   // cram-mode drill sets (new schema)
  | "conceptual"     // feynman/elaboration conceptual schema
  | "active_recall"  // retrieval-heavy schema
  | "flashcards"     // SM-2 flashcard deck (uses existing /api/flashcards)
  | "quiz"           // MCQ extended quiz (uses existing /api/quiz)
  | "tutor_prep";    // AI tutor context (future)

export type StudyPreset =
  | "board_exam_reviewer"
  | "rapid_recall"
  | "conceptual_understanding"
  | "active_recall"
  | "flashcards"
  | "quiz"
  | "ai_tutor";

export type PresetConfig = {
  preset: StudyPreset;
  label: string;
  description: string;
  transformationType: StudyTransformationType;
  learningMethod?: LearningMethod;
  studyMode?: StudyMode;
  estimatedMinutes: number;
  comingSoon?: boolean;
};

export const STUDY_PRESETS: PresetConfig[] = [
  {
    preset: "board_exam_reviewer",
    label: "Board Exam Reviewer",
    description: "High-yield board reviewer with mnemonics, traps, and must-memorize facts",
    transformationType: "reviewer",
    learningMethod: "pomodoro",
    studyMode: "board_exam",
    estimatedMinutes: 2,
  },
  {
    preset: "rapid_recall",
    label: "Rapid Recall",
    description: "Cram-mode cue → response drill sets for last-minute review",
    transformationType: "rapid_recall",
    learningMethod: "blurting",
    studyMode: "cram",
    estimatedMinutes: 1,
  },
  {
    preset: "conceptual_understanding",
    label: "Conceptual Understanding",
    description: "Feynman-style explanations with analogies, mechanisms, and self-check questions",
    transformationType: "conceptual",
    learningMethod: "feynman",
    studyMode: "conceptual",
    estimatedMinutes: 2,
  },
  {
    preset: "active_recall",
    label: "Active Recall",
    description: "Retrieval-heavy format with blurt prompts and self-test Q&A",
    transformationType: "active_recall",
    learningMethod: "active_recall",
    studyMode: "mastery",
    estimatedMinutes: 2,
  },
  {
    preset: "flashcards",
    label: "Flashcard Deck",
    description: "SM-2 spaced repetition cards for long-term retention",
    transformationType: "flashcards",
    studyMode: "cram",
    estimatedMinutes: 1,
  },
  {
    preset: "quiz",
    label: "Practice Quiz",
    description: "Mixed-format quiz with explanations and difficulty scaling",
    transformationType: "quiz",
    studyMode: "mastery",
    estimatedMinutes: 1,
  },
  {
    preset: "ai_tutor",
    label: "AI Tutor",
    description: "Open-ended conversation with a context-aware AI tutor",
    transformationType: "tutor_prep",
    estimatedMinutes: 0,
    comingSoon: false,
  },
];

export type StudyTransformationContent = AnyReviewer | Flashcards | Quiz;

export type StudyTransformation = {
  id: string;
  documentId: string;
  userId: string;
  transcriptVersion: number;
  transformationType: StudyTransformationType;
  learningMethod: LearningMethod | null;
  studyMode: StudyMode | null;
  schemaType: string | null;
  generatedAt: number;
  model: string;
  generationTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
  sourceAnchors: SourceAnchor[];
  metadata: Record<string, unknown>;
  content: StudyTransformationContent;
  supersededBy: string | null;
  createdAt: number;
};

// ─── Competitive / Social ─────────────────────────────────────────────────────

export type UserProfile = {
  id: string;              // uuid — matches auth.users.id
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  xp: number;
  level: number;
  studyStreak: number;
  lastActive: number | null;
  createdAt: number;
};

export type Workspace = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  color: string;           // tailwind color name e.g. "blue", "purple"
  createdAt: number;
};

// ─── Folder ───────────────────────────────────────────────────────────────────

export type Folder = {
  id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number | null;
};

export type StudyGroup = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  inviteCode: string;
  maxMembers: number;
  createdAt: number;
  // Joined from study_group_members when fetching group detail
  memberCount?: number;
  members?: StudyGroupMember[];
};

export type StudyGroupMember = {
  groupId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: number;
  profile?: Pick<UserProfile, "username" | "displayName" | "avatarUrl" | "xp" | "level">;
};

export type BadgeType =
  | "first_mastery"
  | "streak_7"
  | "streak_30"
  | "challenge_winner"
  | "speed_demon"
  | "perfect_score"
  | "group_founder";

export type Badge = {
  id: number;
  userId: string;
  badgeType: BadgeType;
  earnedAt: number;
  metadata: Record<string, unknown>;
};

export type ChallengeStatus = "open" | "closed";

export type Challenge = {
  id: string;
  groupId: string;
  createdBy: string;
  documentId: string | null;
  documentTitle: string;
  difficulty: QuizDifficultyLevel;
  questionCount: number;
  timeLimitMins: number;
  status: ChallengeStatus;
  closesAt: number;
  createdAt: number;
  // Joined fields
  participants?: ChallengeParticipant[];
  mySubmission?: ChallengeParticipant | null;
};

export type ChallengeParticipant = {
  challengeId: string;
  userId: string;
  score: number | null;
  timeTakenS: number | null;
  submittedAt: number | null;
  profile?: Pick<UserProfile, "username" | "displayName" | "avatarUrl">;
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  xp: number;
  level: number;
  studyStreak: number;
};

export type XpEvent =
  | "document_uploaded"
  | "section_completed"
  | "checkpoint_passed"
  | "quiz_passed"
  | "flashcard_session"
  | "challenge_submitted"
  | "challenge_won"
  | "perfect_score";

export const XP_AWARDS: Record<XpEvent, number> = {
  document_uploaded: 10,
  section_completed: 5,
  checkpoint_passed: 15,
  quiz_passed: 50,
  flashcard_session: 10,
  challenge_submitted: 20,
  challenge_won: 75,
  perfect_score: 100,
};

/** XP thresholds per level (level = index + 1). Level 1 starts at 0 XP. */
export const XP_LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];

// ─── Race Mode / Matchmaking ───────────────────────────────────────────────────

export type FriendRequest = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  requester?: Pick<UserProfile, "id" | "username" | "displayName" | "avatarUrl">;
};

export type MatchRoom = {
  id: string;
  roomCode: string;
  hostId: string;
  invitedUserId: string | null;
  sharedDocumentId: string | null;
  documentId: string | null;
  status: "waiting" | "active" | "completed";
  quizSnapshot: QuizQuestion[];
  currentQuestionIndex: number;
  totalQuestions: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  hostProfile?: { displayName: string; username: string } | null;
};

export type MatchParticipant = {
  id: string;
  roomId: string;
  userId: string;
  score: number;
  isReady: boolean;
  joinedAt: string;
  profile?: Pick<UserProfile, "id" | "username" | "displayName" | "avatarUrl">;
};

export type MatchAnswer = {
  id: string;
  roomId: string;
  questionIndex: number;
  userId: string;
  answer: string;
  isCorrect: boolean;
  gotPoint: boolean;
  answeredAt: string;
};

// ─── Study Planner ────────────────────────────────────────────────────────────

export type StudyPlanStatus = "active" | "paused" | "completed" | "archived";

export type StudyPlanItemType =
  | "read_sections"
  | "quiz"
  | "flashcard_review"
  | "remediation"
  | "retention_review"
  | "checkpoint";

export type StudyPlan = {
  id: string;
  userId: string;
  title: string;
  examDate: number;   // UTC ms
  dailyHours: number;
  status: StudyPlanStatus;
  createdAt: number;
  updatedAt: number;
};

export type StudyPlanDocument = {
  id: string;
  planId: string;
  documentId: string;
  priority: number;       // 1 = highest
  weakTopicWeight: number; // 0.5–2.0 multiplier
  paused: boolean;
  addedAt: number;
};

export type StudyPlanItem = {
  id: string;
  planId: string;
  documentId: string;
  itemType: StudyPlanItemType;
  scheduledDate: number;  // UTC ms of the day's midnight
  completedAt: number | null;
  skippedAt: number | null;
  sectionIndices: number[];
  estimatedMins: number;
  metadata: Record<string, unknown>;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type ReviewEventType = "flashcard_review" | "topic_review" | "quiz_retry";

export type ReviewScheduleEvent = {
  id: string;
  userId: string;
  planId: string | null;
  documentId: string;
  eventType: ReviewEventType;
  dueAt: number;
  intervalDays: number;
  easeFactor: number;
  completedAt: number | null;
  createdAt: number;
};

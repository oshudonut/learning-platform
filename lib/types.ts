import { z } from "zod";

// ─── Reviewer (Board-Exam Optimized) ──────────────────────────────────────────

export const ConfusedWithSchema = z.object({
  item: z.string(),
  distinction: z.string(),
});

export const ReviewerTopicSchema = z.object({
  title: z.string(),
  coreIdea: z.string(),
  keyPoints: z.array(z.string()),
  quickBreakdown: z.array(z.string()),
  mustMemorize: z.array(z.string()),
  confusedWith: z.array(ConfusedWithSchema).optional(),
  boardTips: z.array(z.string()),
  quickRecall: z.array(z.string()),
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

export type Quiz = z.infer<typeof QuizSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

// ─── Flashcards ───────────────────────────────────────────────────────────────

export const FlashcardSchema = z.object({
  front: z.string(),
  back: z.string(),
  hint: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string(),
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

// ─── Document ─────────────────────────────────────────────────────────────────

export type Document = {
  id: string;
  title: string;
  filename: string;
  text: string;
  textLength: number;
  contentHash?: string;
  createdAt: number;
  reviewer?: Reviewer;
  quiz?: Quiz;
  flashcards?: Flashcard[];
  flashcardReviewStates?: FlashcardReviewState[];
  chunks?: TextChunk[];
};

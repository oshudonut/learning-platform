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

// ─── Adaptive Reviewer Schema Families ───────────────────────────────────────

// Conceptual: Feynman, Elaboration, Multisensory
export const ConceptualTopicSchema = z.object({
  title: z.string(),
  analogy: z.string(),
  simplifiedExplanation: z.string(),
  mechanism: z.array(z.string()),
  keyTakeaways: z.array(z.string()),
  selfCheck: z.array(z.string()),
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

const MultipleChoiceQuestionSchema = z.object({
  type: z.literal("multiple_choice"),
  question: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
  difficulty,
  topic: z.string(),
});

const TrueFalseQuestionSchema = z.object({
  type: z.literal("true_false"),
  question: z.string(),
  correctAnswer: z.boolean(),
  explanation: z.string(),
  difficulty,
  topic: z.string(),
});

const IdentificationQuestionSchema = z.object({
  type: z.literal("identification"),
  question: z.string(),
  correctAnswer: z.string(),
  acceptableVariants: z.array(z.string()).optional(),
  explanation: z.string(),
  difficulty,
  topic: z.string(),
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
  reviewer?: AnyReviewer;
  quiz?: Quiz;
  flashcards?: Flashcard[];
  flashcardReviewStates?: FlashcardReviewState[];
  chunks?: TextChunk[];
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

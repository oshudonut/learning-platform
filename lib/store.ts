import crypto from "crypto";
import { supabase } from "./supabase";
import { randomId } from "./utils";
import type {
  Document,
  Analytics,
  QuizAttempt,
  FlashcardSession,
  Conversation,
  FlashcardReviewState,
  TextChunk,
  UserProfile,
  Workspace,
  StudyGroup,
  StudyGroupMember,
  Badge,
  BadgeType,
  Challenge,
  ChallengeParticipant,
  LeaderboardEntry,
  XpEvent,
  QuizDifficultyLevel,
  FriendRequest,
  MatchRoom,
  MatchParticipant,
  MatchAnswer,
  QuizQuestion,
  Folder,
  AnyReviewer,
  StudyPlan,
  StudyPlanDocument,
  StudyPlanItem,
  ReviewScheduleEvent,
} from "./types";
export { rowToMatchRoom, rowToParticipant, rowToAnswer } from "./match-mappers";
import { rowToMatchRoom, rowToParticipant, rowToAnswer } from "./match-mappers";
import { XP_AWARDS, XP_LEVEL_THRESHOLDS } from "./types";

// ─── Documents ────────────────────────────────────────────────────────────────

function toRow(doc: Document) {
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.filename,
    text: doc.text,
    text_length: doc.textLength,
    content_hash: doc.contentHash ?? null,
    created_at: doc.createdAt,
    user_id: doc.userId ?? null,
    folder_id: doc.folderId ?? null,
    reviewer: doc.reviewer ?? null,
    quiz: doc.quiz ?? null,
    flashcards: doc.flashcards ?? null,
    flashcard_review_states: doc.flashcardReviewStates ?? null,
    chunks: doc.chunks ?? null,
  };
}

function fromRow(row: Record<string, unknown>): Document {
  return {
    id: row.id as string,
    title: row.title as string,
    filename: row.filename as string,
    text: row.text as string,
    textLength: row.text_length as number,
    contentHash: (row.content_hash as string | null) ?? undefined,
    createdAt: row.created_at as number,
    userId: (row.user_id as string | null) ?? null,
    folderId: (row.folder_id as string | null) ?? null,
    reviewer: (row.reviewer as Document["reviewer"]) ?? undefined,
    quiz: (row.quiz as Document["quiz"]) ?? undefined,
    flashcards: (row.flashcards as Document["flashcards"]) ?? undefined,
    flashcardReviewStates:
      (row.flashcard_review_states as Document["flashcardReviewStates"]) ??
      undefined,
    chunks: (row.chunks as Document["chunks"]) ?? undefined,
  };
}

export async function saveDocument(doc: Document): Promise<void> {
  const { error } = await supabase.from("documents").upsert(toRow(doc));
  if (error) throw new Error(`saveDocument: ${error.message}`);
}

async function _getDocumentRaw(id: string): Promise<Document | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getDocument: ${error.message}`);
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function copyDocumentForUser(sourceDocId: string, targetUserId: string): Promise<Document> {
  const source = await _getDocumentRaw(sourceDocId);
  if (!source) throw new Error("Source document not found");
  const copy: Document = {
    ...source,
    id: randomId(),
    userId: targetUserId,
    createdAt: Date.now(),
    flashcardReviewStates: undefined,
  };
  await saveDocument(copy);
  return copy;
}

export async function getDocument(id: string, userId: string): Promise<Document | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getDocument: ${error.message}`);
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function getDocumentTitle(id: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("title")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getDocumentTitle: ${error.message}`);
  return (data?.title as string | null) ?? null;
}

export async function updateDocument(
  id: string,
  userId: string,
  patch: Partial<Document>,
): Promise<Document> {
  const existing = await getDocument(id, userId);
  if (!existing) throw new Error(`Document ${id} not found`);
  const updated = { ...existing, ...patch };
  await saveDocument(updated);
  return updated;
}

export async function deleteDocument(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteDocument: ${error.message}`);
}

export type DocSummary = Omit<Document, "text" | "reviewer" | "quiz" | "flashcards"> & {
  hasReviewer: boolean;
  hasQuiz: boolean;
  hasFlashcards: boolean;
  conceptCount: number;
  questionCount: number;
  flashcardCount: number;
};

export async function listDocuments(userId: string): Promise<DocSummary[]> {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, title, filename, text_length, content_hash, created_at, user_id, folder_id, flashcard_review_states, chunks, reviewer, quiz, flashcards",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listDocuments: ${error.message}`);

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const reviewer = r.reviewer as Document["reviewer"] | null;
    const quiz = r.quiz as Document["quiz"] | null;
    const flashcards = r.flashcards as Document["flashcards"] | null;
    return {
      id: r.id as string,
      title: r.title as string,
      filename: r.filename as string,
      textLength: r.text_length as number,
      contentHash: (r.content_hash as string | null) ?? undefined,
      createdAt: r.created_at as number,
      userId: (r.user_id as string | null) ?? null,
      folderId: (r.folder_id as string | null) ?? null,
      flashcardReviewStates:
        (r.flashcard_review_states as Document["flashcardReviewStates"]) ??
        undefined,
      chunks: (r.chunks as Document["chunks"]) ?? undefined,
      hasReviewer: Boolean(reviewer),
      hasQuiz: Boolean(quiz),
      hasFlashcards: Boolean(flashcards?.length),
      conceptCount: reviewer?.topics?.length ?? 0,
      questionCount: quiz?.questions?.length ?? 0,
      flashcardCount: flashcards?.length ?? 0,
    };
  });
}

// ─── Flashcard review states ───────────────────────────────────────────────────

export async function saveFlashcardReviewStates(
  docId: string,
  userId: string,
  states: FlashcardReviewState[],
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ flashcard_review_states: states })
    .eq("id", docId)
    .eq("user_id", userId);
  if (error) throw new Error(`saveFlashcardReviewStates: ${error.message}`);
}

export async function getFlashcardReviewStates(
  docId: string,
  userId: string,
): Promise<FlashcardReviewState[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("flashcard_review_states")
    .eq("id", docId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getFlashcardReviewStates: ${error.message}`);
  return (data?.flashcard_review_states as FlashcardReviewState[] | null) ?? [];
}

// ─── Text chunks ──────────────────────────────────────────────────────────────

/**
 * Persist pre-computed chunks onto the document record.
 *
 * This intentionally replaces any previously stored chunks so re-uploads of
 * the same document ID always reflect the latest extraction.
 */
export async function saveChunks(
  docId: string,
  userId: string,
  chunks: TextChunk[],
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ chunks })
    .eq("id", docId)
    .eq("user_id", userId);
  if (error) throw new Error(`saveChunks: ${error.message}`);
}

export async function getChunks(docId: string, userId: string): Promise<TextChunk[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("chunks")
    .eq("id", docId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getChunks: ${error.message}`);
  return (data?.chunks as TextChunk[] | null) ?? [];
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function saveConversation(conv: Conversation, userId: string): Promise<void> {
  const { error } = await supabase.from("conversations").upsert({
    id: conv.id,
    document_id: conv.documentId,
    document_title: conv.documentTitle,
    messages: conv.messages,
    created_at: conv.createdAt,
    updated_at: conv.updatedAt,
    user_id: userId,
  });
  if (error) throw new Error(`saveConversation: ${error.message}`);
}

export async function getConversation(id: string, userId: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getConversation: ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    documentId: (r.document_id as string | null) ?? null,
    documentTitle: (r.document_title as string | null) ?? null,
    messages: (r.messages as Conversation["messages"]) ?? [],
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

export async function listConversations(
  userId: string,
  documentId?: string,
): Promise<Conversation[]> {
  let query = supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (documentId !== undefined) {
    query = query.eq("document_id", documentId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`listConversations: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      documentId: (r.document_id as string | null) ?? null,
      documentTitle: (r.document_title as string | null) ?? null,
      messages: (r.messages as Conversation["messages"]) ?? [],
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    };
  });
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteConversation: ${error.message}`);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function calcStreak(currentStreak: number, lastStudied: number | null): number {
  const now = Date.now();
  const oneDayMs = 86_400_000;
  if (!lastStudied) return 1;
  const daysSince = Math.floor((now - lastStudied) / oneDayMs);
  if (daysSince === 0) return currentStreak;
  if (daysSince === 1) return currentStreak + 1;
  return 1;
}

async function _updateAnalyticsMeta(userId: string, studyMinutes: number): Promise<void> {
  const { data: meta } = await supabase
    .from("analytics_meta")
    .select("study_streak, last_studied, total_study_time")
    .eq("user_id", userId)
    .maybeSingle();

  const now = Date.now();
  const m = meta as { study_streak: number; last_studied: number | null; total_study_time: number } | null;
  const newStreak = m ? calcStreak(m.study_streak, m.last_studied) : 1;

  const { error } = await supabase.from("analytics_meta").upsert(
    {
      user_id: userId,
      study_streak: newStreak,
      last_studied: now,
      total_study_time: (m?.total_study_time ?? 0) + studyMinutes,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`_updateAnalyticsMeta: ${error.message}`);
}

export async function recordQuizAttempt(attempt: QuizAttempt, userId: string): Promise<void> {
  const { error: insertError } = await supabase.from("quiz_attempts").insert({
    quiz_id: attempt.quizId,
    document_id: attempt.documentId,
    document_title: attempt.documentTitle,
    score: attempt.score,
    total_questions: attempt.totalQuestions,
    correct_answers: attempt.correctAnswers,
    weak_topics: attempt.weakTopics,
    completed_at: attempt.completedAt,
    user_id: userId,
  });
  if (insertError) throw new Error(`recordQuizAttempt insert: ${insertError.message}`);
  await _updateAnalyticsMeta(userId, 5);
}

export async function recordFlashcardSession(
  session: FlashcardSession,
  userId: string,
): Promise<void> {
  const { error: insertError } = await supabase.from("flashcard_sessions").insert({
    document_id: session.documentId,
    document_title: session.documentTitle,
    cards_studied: session.cardsStudied,
    avg_quality: session.avgQuality,
    completed_at: session.completedAt,
    user_id: userId,
  });
  if (insertError) throw new Error(`recordFlashcardSession insert: ${insertError.message}`);
  await _updateAnalyticsMeta(userId, Math.ceil(session.cardsStudied * 0.5));
}

export async function getAnalytics(userId: string): Promise<Analytics> {
  const [quizRes, flashRes, metaRes] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false }),
    supabase
      .from("flashcard_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false }),
    supabase
      .from("analytics_meta")
      .select("study_streak, last_studied, total_study_time")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (quizRes.error) throw new Error(`getAnalytics quiz: ${quizRes.error.message}`);
  if (flashRes.error) throw new Error(`getAnalytics flash: ${flashRes.error.message}`);
  if (metaRes.error) throw new Error(`getAnalytics meta: ${metaRes.error.message}`);

  const quizAttempts: QuizAttempt[] = (quizRes.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      quizId: row.quiz_id as string,
      documentId: row.document_id as string,
      documentTitle: row.document_title as string,
      score: row.score as number,
      totalQuestions: row.total_questions as number,
      correctAnswers: row.correct_answers as number,
      weakTopics: (row.weak_topics as string[]) ?? [],
      completedAt: row.completed_at as number,
    };
  });

  const flashcardSessions: FlashcardSession[] = (flashRes.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      documentId: row.document_id as string,
      documentTitle: row.document_title as string,
      cardsStudied: row.cards_studied as number,
      avgQuality: row.avg_quality as number,
      completedAt: row.completed_at as number,
    };
  });

  const m = metaRes.data as {
    study_streak: number;
    last_studied: number | null;
    total_study_time: number;
  } | null;

  return {
    quizAttempts,
    flashcardSessions,
    studyStreak: m?.study_streak ?? 0,
    lastStudied: m?.last_studied ?? null,
    totalStudyTime: m?.total_study_time ?? 0,
  };
}

// ─── Content hash ─────────────────────────────────────────────────────────────

export function computeContentHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

export async function getDocumentByContentHash(
  hash: string,
  userId: string,
): Promise<Document | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("content_hash", hash)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getDocumentByContentHash: ${error.message}`);
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

// ─── Document Progression ────────────────────────────────────────────────────

export async function getProgression(documentId: string, userId: string): Promise<import("./types").DocumentProgression | null> {
  // Verify document ownership before returning progression
  const { data: ownerRow } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownerRow) return null;

  const { data, error } = await supabase
    .from("document_progressions")
    .select("*")
    .eq("document_id", documentId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }
  return rowToProgression(data);
}

export async function upsertProgression(progression: import("./types").DocumentProgression): Promise<void> {
  const { error } = await supabase.from("document_progressions").upsert({
    document_id: progression.documentId,
    section_statuses: progression.sectionStatuses,
    checkpoint_statuses: progression.checkpointStatuses,
    quiz_unlocked: progression.quizUnlocked,
    mastered_at: progression.masteredAt ?? null,
    difficulty_level: progression.currentDifficultyLevel,
    remediation_active: progression.remediationActive,
    remediation_completed_at: progression.remediationCompletedAt ?? null,
    current_section_index: progression.currentSectionIndex ?? 0,
    flashcard_challenge_completed: progression.flashcardChallengeCompleted ?? false,
    learning_method: progression.learningMethod ?? null,
    study_mode: progression.studyMode ?? null,
    created_at: progression.createdAt,
    updated_at: Date.now(),
  });
  if (error) throw error;
}

function rowToProgression(row: Record<string, unknown>): import("./types").DocumentProgression {
  return {
    documentId: row.document_id as string,
    sectionStatuses: row.section_statuses as import("./types").DocumentProgression["sectionStatuses"],
    checkpointStatuses: row.checkpoint_statuses as import("./types").DocumentProgression["checkpointStatuses"],
    quizUnlocked: row.quiz_unlocked as boolean,
    masteredAt: (row.mastered_at as number | null) ?? null,
    currentDifficultyLevel: (row.difficulty_level as import("./types").DocumentProgression["currentDifficultyLevel"]) ?? "beginner",
    remediationActive: row.remediation_active as boolean,
    remediationCompletedAt: (row.remediation_completed_at as number | null) ?? null,
    currentSectionIndex: (row.current_section_index as number | null) ?? 0,
    flashcardChallengeCompleted: (row.flashcard_challenge_completed as boolean | null) ?? false,
    learningMethod: (row.learning_method as import("./types").LearningMethod | null) ?? null,
    studyMode: (row.study_mode as import("./types").StudyMode | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export async function listProgressions(
  userId: string,
): Promise<import("./types").DocumentProgression[]> {
  const { data: docRows, error: docErr } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", userId);
  if (docErr) throw new Error(`listProgressions docs: ${docErr.message}`);

  const docIds = (docRows ?? []).map((r) => (r as Record<string, unknown>).id as string);
  if (docIds.length === 0) return [];

  const { data, error } = await supabase
    .from("document_progressions")
    .select("*")
    .in("document_id", docIds);
  if (error) throw new Error(`listProgressions: ${error.message}`);
  return (data ?? []).map((r) => rowToProgression(r as Record<string, unknown>));
}

export async function getRecentQuizAttempts(userId: string, limit = 20): Promise<QuizAttempt[]> {
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("quiz_id, document_id, document_title, score, total_questions, correct_answers, weak_topics, completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentQuizAttempts: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      quizId: row.quiz_id as string,
      documentId: row.document_id as string,
      documentTitle: row.document_title as string,
      score: row.score as number,
      totalQuestions: row.total_questions as number,
      correctAnswers: row.correct_answers as number,
      weakTopics: (row.weak_topics as string[]) ?? [],
      completedAt: row.completed_at as number,
    };
  });
}

// ─── Checkpoint Flashcards ────────────────────────────────────────────────────

export async function getCheckpointFlashcards(documentId: string, checkpointIndex: number, userId: string): Promise<import("./types").Flashcard[] | null> {
  const { data, error } = await supabase
    .from("checkpoint_flashcards")
    .select("cards")
    .eq("document_id", documentId)
    .eq("checkpoint_index", checkpointIndex)
    .eq("user_id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data.cards as import("./types").Flashcard[];
}

export async function saveCheckpointFlashcards(documentId: string, checkpointIndex: number, cards: import("./types").Flashcard[], userId: string): Promise<void> {
  const { error } = await supabase.from("checkpoint_flashcards").upsert({
    document_id: documentId,
    checkpoint_index: checkpointIndex,
    user_id: userId,
    cards,
    generated_at: Date.now(),
  });
  if (error) throw error;
}

// ─── Remediation ──────────────────────────────────────────────────────────────

export async function getLatestRemediationReviewer(documentId: string, userId: string): Promise<{ weakTopics: string[]; content: AnyReviewer } | null> {
  const { data, error } = await supabase
    .from("remediation_reviewers")
    .select("weak_topics, content")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return { weakTopics: data.weak_topics as string[], content: data.content as AnyReviewer };
}

export async function saveRemediationReviewer(documentId: string, weakTopics: string[], content: AnyReviewer, userId: string): Promise<void> {
  const { error } = await supabase.from("remediation_reviewers").insert({
    document_id: documentId,
    user_id: userId,
    weak_topics: weakTopics,
    content,
    generated_at: Date.now(),
  });
  if (error) throw error;
}

// ─── User Profiles ────────────────────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    xp: (row.xp as number) ?? 0,
    level: (row.level as number) ?? 1,
    studyStreak: (row.study_streak as number) ?? 0,
    lastActive: (row.last_active as number | null) ?? null,
    createdAt: row.created_at as number,
  };
}

export async function ensureUserProfile(userId: string, email: string): Promise<void> {
  const username = email.split("@")[0] + "_" + userId.slice(0, 6);
  const { error } = await supabase.from("user_profiles").upsert(
    { id: userId, username, display_name: email.split("@")[0] },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) throw new Error(`ensureUserProfile: ${error.message}`);
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`getProfile: ${error.message}`);
  if (!data) return null;
  return rowToProfile(data as Record<string, unknown>);
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<UserProfile, "displayName" | "bio" | "avatarUrl">>,
): Promise<UserProfile> {
  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.bio !== undefined) update.bio = patch.bio;
  if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;

  const { data, error } = await supabase
    .from("user_profiles")
    .update(update)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw new Error(`updateProfile: ${error.message}`);
  return rowToProfile(data as Record<string, unknown>);
}

// ─── XP & Level ───────────────────────────────────────────────────────────────

function calcLevel(xp: number): number {
  let level = 1;
  for (let i = XP_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return level;
}

/**
 * Award XP to a user. Updates xp, level, study_streak, last_active, and
 * logs to daily_xp_log (upsert). Returns the updated profile.
 */
export async function awardXp(userId: string, event: XpEvent): Promise<UserProfile> {
  const amount = XP_AWARDS[event];
  const profile = await getProfile(userId);
  if (!profile) throw new Error(`awardXp: user ${userId} not found`);

  const newXp = profile.xp + amount;
  const newLevel = calcLevel(newXp);

  // Streak: if last_active was yesterday, increment; if today, keep; else reset to 1
  const nowMs = Date.now();
  const oneDayMs = 86_400_000;
  let newStreak = profile.studyStreak;
  if (!profile.lastActive) {
    newStreak = 1;
  } else {
    const daysSince = Math.floor((nowMs - profile.lastActive) / oneDayMs);
    if (daysSince === 0) {
      // same day — streak unchanged
    } else if (daysSince === 1) {
      newStreak = profile.studyStreak + 1;
    } else {
      newStreak = 1;
    }
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update({ xp: newXp, level: newLevel, study_streak: newStreak, last_active: nowMs })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw new Error(`awardXp update: ${error.message}`);

  // Log to daily_xp_log — direct upsert (simpler than an RPC that may not exist)
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  try {
    const { data: existingLog } = await supabase
      .from("daily_xp_log")
      .select("xp_earned")
      .eq("user_id", userId)
      .eq("day", today)
      .maybeSingle();
    const currentDayXp = (existingLog?.xp_earned as number | null) ?? 0;
    await supabase.from("daily_xp_log").upsert(
      { user_id: userId, day: today, xp_earned: currentDayXp + amount },
      { onConflict: "user_id,day" },
    );
  } catch {
    // Non-critical — do not throw
  }

  return rowToProfile(data as Record<string, unknown>);
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, username, display_name, avatar_url, xp, level, study_streak")
    .order("xp", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getLeaderboard: ${error.message}`);
  return (data ?? []).map((row, i) => {
    const r = row as Record<string, unknown>;
    return {
      rank: i + 1,
      userId: r.id as string,
      username: r.username as string,
      displayName: r.display_name as string,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      xp: r.xp as number,
      level: r.level as number,
      studyStreak: r.study_streak as number,
    };
  });
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export async function getBadges(userId: string): Promise<Badge[]> {
  const { data, error } = await supabase
    .from("badges")
    .select("*")
    .eq("user_id", userId)
    .order("earned_at", { ascending: false });
  if (error) throw new Error(`getBadges: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      userId: r.user_id as string,
      badgeType: r.badge_type as BadgeType,
      earnedAt: r.earned_at as number,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    };
  });
}

/**
 * Award a badge. No-ops if the badge already exists (unique index).
 * Uses the service-key client which bypasses the restrictive RLS policy.
 */
export async function awardBadge(
  userId: string,
  badgeType: BadgeType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from("badges").insert({
    user_id: userId,
    badge_type: badgeType,
    earned_at: Date.now(),
    metadata,
  });
  // Unique constraint violation = badge already awarded — that's fine
  if (error && !error.message.includes("unique") && !error.message.includes("duplicate")) {
    throw new Error(`awardBadge: ${error.message}`);
  }
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    color: (row.color as string) ?? "blue",
    createdAt: row.created_at as number,
  };
}

export async function createWorkspace(ws: Omit<Workspace, "createdAt"> & { id: string }): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      id: ws.id,
      user_id: ws.userId,
      name: ws.name,
      description: ws.description ?? null,
      color: ws.color,
      created_at: Date.now(),
    })
    .select()
    .single();
  if (error) throw new Error(`createWorkspace: ${error.message}`);
  return rowToWorkspace(data as Record<string, unknown>);
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listWorkspaces: ${error.message}`);
  return (data ?? []).map((r) => rowToWorkspace(r as Record<string, unknown>));
}

export async function updateWorkspace(
  id: string,
  userId: string,
  patch: Partial<Pick<Workspace, "name" | "description" | "color">>,
): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspaces")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`updateWorkspace: ${error.message}`);
  return rowToWorkspace(data as Record<string, unknown>);
}

export async function deleteWorkspace(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteWorkspace: ${error.message}`);
}

// ─── Study Groups ─────────────────────────────────────────────────────────────

function rowToGroup(row: Record<string, unknown>): StudyGroup {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    inviteCode: row.invite_code as string,
    maxMembers: row.max_members as number,
    createdAt: row.created_at as number,
  };
}

export async function createStudyGroup(
  group: Pick<StudyGroup, "id" | "ownerId" | "name" | "description" | "inviteCode" | "maxMembers">,
): Promise<StudyGroup> {
  const now = Date.now();

  const { data: groupData, error: groupError } = await supabase
    .from("study_groups")
    .insert({
      id: group.id,
      owner_id: group.ownerId,
      name: group.name,
      description: group.description ?? null,
      invite_code: group.inviteCode,
      max_members: group.maxMembers,
      created_at: now,
    })
    .select()
    .single();
  if (groupError) throw new Error(`createStudyGroup: ${groupError.message}`);

  // Add the creator as owner-role member
  const { error: memberError } = await supabase.from("study_group_members").insert({
    group_id: group.id,
    user_id: group.ownerId,
    role: "owner",
    joined_at: now,
  });
  if (memberError) throw new Error(`createStudyGroup member: ${memberError.message}`);

  return rowToGroup(groupData as Record<string, unknown>);
}

export async function getStudyGroup(groupId: string): Promise<StudyGroup | null> {
  const { data, error } = await supabase
    .from("study_groups")
    .select("*")
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(`getStudyGroup: ${error.message}`);
  if (!data) return null;
  return rowToGroup(data as Record<string, unknown>);
}

export async function listStudyGroups(userId: string): Promise<StudyGroup[]> {
  // Get all groups where the user is a member
  const { data, error } = await supabase
    .from("study_group_members")
    .select("group_id, study_groups(*)")
    .eq("user_id", userId);
  if (error) throw new Error(`listStudyGroups: ${error.message}`);
  return (data ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const g = r.study_groups as Record<string, unknown> | null;
      return g ? rowToGroup(g) : null;
    })
    .filter((g): g is StudyGroup => g !== null);
}

export async function getStudyGroupByInviteCode(inviteCode: string): Promise<StudyGroup | null> {
  const { data, error } = await supabase
    .from("study_groups")
    .select("*")
    .eq("invite_code", inviteCode)
    .maybeSingle();
  if (error) throw new Error(`getStudyGroupByInviteCode: ${error.message}`);
  if (!data) return null;
  return rowToGroup(data as Record<string, unknown>);
}

export async function joinStudyGroup(groupId: string, userId: string): Promise<void> {
  // Check member count against limit
  const group = await getStudyGroup(groupId);
  if (!group) throw new Error("Group not found");

  const { count, error: countError } = await supabase
    .from("study_group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (countError) throw new Error(`joinStudyGroup count: ${countError.message}`);
  if ((count ?? 0) >= group.maxMembers) throw new Error("Group is full");

  const { error } = await supabase.from("study_group_members").insert({
    group_id: groupId,
    user_id: userId,
    role: "member",
    joined_at: Date.now(),
  });
  // Ignore duplicate (already a member)
  if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
    throw new Error(`joinStudyGroup: ${error.message}`);
  }
}

export async function leaveStudyGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("study_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw new Error(`leaveStudyGroup: ${error.message}`);
}

export async function getGroupMembers(groupId: string): Promise<StudyGroupMember[]> {
  const { data, error } = await supabase
    .from("study_group_members")
    .select("*, user_profiles(username, display_name, avatar_url, xp, level)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`getGroupMembers: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const profile = r.user_profiles as Record<string, unknown> | null;
    return {
      groupId: r.group_id as string,
      userId: r.user_id as string,
      role: r.role as "owner" | "member",
      joinedAt: r.joined_at as number,
      profile: profile
        ? {
            username: profile.username as string,
            displayName: profile.display_name as string,
            avatarUrl: (profile.avatar_url as string | null) ?? null,
            xp: profile.xp as number,
            level: profile.level as number,
          }
        : undefined,
    };
  });
}

// ─── Challenges ───────────────────────────────────────────────────────────────

function rowToChallenge(row: Record<string, unknown>): Challenge {
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    createdBy: row.created_by as string,
    documentId: (row.document_id as string | null) ?? null,
    documentTitle: row.document_title as string,
    difficulty: row.difficulty as QuizDifficultyLevel,
    questionCount: row.question_count as number,
    timeLimitMins: row.time_limit_mins as number,
    status: row.status as "open" | "closed",
    closesAt: row.closes_at as number,
    createdAt: row.created_at as number,
  };
}

export async function createChallenge(
  challenge: Pick<Challenge, "id" | "groupId" | "createdBy" | "documentId" | "documentTitle" | "difficulty" | "questionCount" | "timeLimitMins" | "closesAt">,
): Promise<Challenge> {
  const { data, error } = await supabase
    .from("challenges")
    .insert({
      id: challenge.id,
      group_id: challenge.groupId,
      created_by: challenge.createdBy,
      document_id: challenge.documentId ?? null,
      document_title: challenge.documentTitle,
      difficulty: challenge.difficulty,
      question_count: challenge.questionCount,
      time_limit_mins: challenge.timeLimitMins,
      status: "open",
      closes_at: challenge.closesAt,
      created_at: Date.now(),
    })
    .select()
    .single();
  if (error) throw new Error(`createChallenge: ${error.message}`);
  return rowToChallenge(data as Record<string, unknown>);
}

export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (error) throw new Error(`getChallenge: ${error.message}`);
  if (!data) return null;
  return rowToChallenge(data as Record<string, unknown>);
}

export async function listGroupChallenges(groupId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listGroupChallenges: ${error.message}`);
  return (data ?? []).map((r) => rowToChallenge(r as Record<string, unknown>));
}

export async function submitChallengeResult(
  challengeId: string,
  userId: string,
  score: number,
  timeTakenS: number,
): Promise<void> {
  const now = Date.now();
  const { error } = await supabase.from("challenge_participants").upsert({
    challenge_id: challengeId,
    user_id: userId,
    score,
    time_taken_s: timeTakenS,
    submitted_at: now,
  }, { onConflict: "challenge_id,user_id" });
  if (error) throw new Error(`submitChallengeResult: ${error.message}`);
}

export async function getChallengeParticipants(challengeId: string): Promise<ChallengeParticipant[]> {
  const { data, error } = await supabase
    .from("challenge_participants")
    .select("*, user_profiles(username, display_name, avatar_url)")
    .eq("challenge_id", challengeId)
    .order("score", { ascending: false });
  if (error) throw new Error(`getChallengeParticipants: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const profile = r.user_profiles as Record<string, unknown> | null;
    return {
      challengeId: r.challenge_id as string,
      userId: r.user_id as string,
      score: (r.score as number | null) ?? null,
      timeTakenS: (r.time_taken_s as number | null) ?? null,
      submittedAt: (r.submitted_at as number | null) ?? null,
      profile: profile
        ? {
            username: profile.username as string,
            displayName: profile.display_name as string,
            avatarUrl: (profile.avatar_url as string | null) ?? null,
          }
        : undefined,
    };
  });
}

export async function closeExpiredChallenges(): Promise<void> {
  const { error } = await supabase
    .from("challenges")
    .update({ status: "closed" })
    .eq("status", "open")
    .lt("closes_at", Date.now());
  if (error) throw new Error(`closeExpiredChallenges: ${error.message}`);
}

// ─── Race Mode ────────────────────────────────────────────────────────────────

export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// rowToMatchRoom, rowToParticipant, rowToAnswer are imported from ./match-mappers (see top of file)

// ─── Friends ──────────────────────────────────────────────────────────────────

export async function searchUsers(query: string, excludeUserId: string): Promise<import("./types").UserProfile[]> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .ilike("username", `%${query}%`)
    .neq("id", excludeUserId)
    .limit(10);
  if (error) throw new Error(`searchUsers: ${error.message}`);
  return (data ?? []).map(rowToProfile);
}

export async function sendFriendRequest(requesterId: string, addresseeId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: requesterId, addressee_id: addresseeId });
  if (error) throw new Error(`sendFriendRequest: ${error.message}`);
}

export async function respondToFriendRequest(
  requesterId: string,
  addresseeId: string,
  accept: boolean
): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("requester_id", requesterId)
    .eq("addressee_id", addresseeId);
  if (error) throw new Error(`respondToFriendRequest: ${error.message}`);
}

export async function getFriends(userId: string): Promise<import("./types").UserProfile[]> {
  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw new Error(`getFriends: ${error.message}`);
  if (!friendships?.length) return [];

  const otherIds = friendships.map((f) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  );

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .in("id", otherIds);
  if (profileError) throw new Error(`getFriends profiles: ${profileError.message}`);
  return (profiles ?? []).map((p) => rowToProfile(p as Record<string, unknown>));
}

export async function getPendingRequests(userId: string): Promise<FriendRequest[]> {
  const { data: rows, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .eq("addressee_id", userId)
    .eq("status", "pending");
  if (error) throw new Error(`getPendingRequests: ${error.message}`);
  if (!rows?.length) return [];

  const requesterIds = rows.map((r) => r.requester_id);
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", requesterIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((row) => {
    const p = profileMap.get(row.requester_id);
    return {
      id: row.id,
      requesterId: row.requester_id,
      addresseeId: row.addressee_id,
      status: row.status as "pending",
      createdAt: row.created_at,
      requester: p
        ? { id: p.id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url }
        : undefined,
    };
  });
}

// ─── Match Rooms ──────────────────────────────────────────────────────────────

export async function createMatch(
  hostId: string,
  documentId: string,
  quizSnapshot: QuizQuestion[],
  invitedUserId?: string,
  sharedDocumentId?: string
): Promise<MatchRoom> {
  // Cancel any stale "waiting" matches from this host so the invited user's
  // polling client only ever sees the newest invitation.
  await supabase
    .from("match_rooms")
    .delete()
    .eq("host_id", hostId)
    .eq("status", "waiting");

  const roomCode = generateRoomCode();
  const { data, error } = await supabase
    .from("match_rooms")
    .insert({
      room_code: roomCode,
      host_id: hostId,
      document_id: documentId,
      quiz_snapshot: quizSnapshot,
      total_questions: quizSnapshot.length,
      invited_user_id: invitedUserId ?? null,
      shared_document_id: sharedDocumentId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createMatch: ${error.message}`);
  const { error: participantError } = await supabase
    .from("match_participants")
    .insert({ room_id: data.id, user_id: hostId });
  if (participantError) throw new Error(`createMatch participant: ${participantError.message}`);
  return rowToMatchRoom(data as Record<string, unknown>);
}

export async function getPendingInvitations(userId: string): Promise<MatchRoom[]> {
  const { data, error } = await supabase
    .from("match_rooms")
    .select("*, user_profiles!host_id(display_name, username)")
    .eq("invited_user_id", userId)
    .eq("status", "waiting")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getPendingInvitations: ${error.message}`);
  return (data ?? []).map((row) => rowToMatchRoom(row as Record<string, unknown>));
}

export async function cancelPendingInvitationsExcept(userId: string, acceptedMatchId: string): Promise<void> {
  await supabase
    .from("match_rooms")
    .delete()
    .eq("invited_user_id", userId)
    .eq("status", "waiting")
    .neq("id", acceptedMatchId);
}

export async function cancelMatch(matchId: string): Promise<void> {
  const { error } = await supabase
    .from("match_rooms")
    .delete()
    .eq("id", matchId);
  if (error) throw new Error(`cancelMatch: ${error.message}`);
}

export async function getMatchByCode(code: string): Promise<MatchRoom | null> {
  const { data, error } = await supabase
    .from("match_rooms")
    .select("*")
    .eq("room_code", code.toUpperCase())
    .single();
  if (error) return null;
  return rowToMatchRoom(data as Record<string, unknown>);
}

export async function getMatch(id: string): Promise<MatchRoom | null> {
  const { data, error } = await supabase
    .from("match_rooms")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return rowToMatchRoom(data as Record<string, unknown>);
}

export async function joinMatch(roomId: string, userId: string): Promise<void> {
  // upsert with ignoreDuplicates so a double-join (auto-join race on mount) is a no-op
  // rather than throwing a unique-constraint error that surfaces as a 500.
  const { error } = await supabase
    .from("match_participants")
    .upsert(
      { room_id: roomId, user_id: userId },
      { onConflict: "room_id,user_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`joinMatch: ${error.message}`);
}

export async function setPlayerReady(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("match_participants")
    .update({ is_ready: true })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (error) throw new Error(`setPlayerReady: ${error.message}`);
}

export async function startMatch(roomId: string): Promise<void> {
  const { error } = await supabase
    .from("match_rooms")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw new Error(`startMatch: ${error.message}`);
}

export async function submitAnswer(
  roomId: string,
  questionIndex: number,
  userId: string,
  answer: string,
  isCorrect: boolean
): Promise<{ gotPoint: boolean }> {
  const { data: existing } = await supabase
    .from("match_answers")
    .select("id")
    .eq("room_id", roomId)
    .eq("question_index", questionIndex)
    .eq("got_point", true)
    .maybeSingle();

  const gotPoint = isCorrect && !existing;

  const { error } = await supabase.from("match_answers").insert({
    room_id: roomId,
    question_index: questionIndex,
    user_id: userId,
    answer,
    is_correct: isCorrect,
    got_point: gotPoint,
  });
  if (error) throw new Error(`submitAnswer: ${error.message}`);

  if (gotPoint) {
    const { data: participant } = await supabase
      .from("match_participants")
      .select("score")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .single();
    if (participant) {
      await supabase
        .from("match_participants")
        .update({ score: (participant.score ?? 0) + 1 })
        .eq("room_id", roomId)
        .eq("user_id", userId);
    }
  }

  return { gotPoint };
}

export async function advanceQuestion(roomId: string): Promise<void> {
  const { data: room } = await supabase
    .from("match_rooms")
    .select("current_question_index, total_questions")
    .eq("id", roomId)
    .single();
  if (!room) return;
  const next = (room.current_question_index ?? 0) + 1;
  if (next >= room.total_questions) {
    await completeMatch(roomId);
  } else {
    await supabase.from("match_rooms").update({ current_question_index: next }).eq("id", roomId);
  }
}

export async function completeMatch(roomId: string): Promise<void> {
  const { error } = await supabase
    .from("match_rooms")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw new Error(`completeMatch: ${error.message}`);
}

export async function getMatchParticipants(roomId: string): Promise<MatchParticipant[]> {
  const { data, error } = await supabase
    .from("match_participants")
    .select("*, user_profiles!left(id, username, display_name, avatar_url)")
    .eq("room_id", roomId);
  if (error) throw new Error(`getMatchParticipants: ${error.message}`);
  return (data ?? []).map((row) => rowToParticipant(row as Record<string, unknown>));
}

export async function getMatchAnswers(roomId: string): Promise<MatchAnswer[]> {
  const { data, error } = await supabase
    .from("match_answers")
    .select("*")
    .eq("room_id", roomId)
    .order("answered_at", { ascending: true });
  if (error) throw new Error(`getMatchAnswers: ${error.message}`);
  return (data ?? []).map((row) => rowToAnswer(row as Record<string, unknown>));
}

// ─── Folders ──────────────────────────────────────────────────────────────────

function rowToFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    color: (row.color as string) ?? "blue",
    createdAt: row.created_at as number,
    updatedAt: (row.updated_at as number | null) ?? null,
  };
}

export async function createFolder(userId: string, name: string, color = "blue"): Promise<Folder> {
  const { data, error } = await supabase
    .from("folders")
    .insert({ id: randomId(), user_id: userId, name, color, created_at: Date.now() })
    .select()
    .single();
  if (error) throw new Error(`createFolder: ${error.message}`);
  return rowToFolder(data as Record<string, unknown>);
}

export async function listFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listFolders: ${error.message}`);
  return (data ?? []).map((r) => rowToFolder(r as Record<string, unknown>));
}

export async function updateFolder(
  id: string,
  userId: string,
  patch: Partial<Pick<Folder, "name" | "color">>,
): Promise<Folder> {
  const update: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.color !== undefined) update.color = patch.color;
  const { data, error } = await supabase
    .from("folders")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`updateFolder: ${error.message}`);
  return rowToFolder(data as Record<string, unknown>);
}

export async function deleteFolder(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("folders")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteFolder: ${error.message}`);
}

export async function moveDocumentToFolder(
  docId: string,
  userId: string,
  folderId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ folder_id: folderId })
    .eq("id", docId)
    .eq("user_id", userId);
  if (error) throw new Error(`moveDocumentToFolder: ${error.message}`);
}

export async function renameDocument(docId: string, userId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ title })
    .eq("id", docId)
    .eq("user_id", userId);
  if (error) throw new Error(`renameDocument: ${error.message}`);
}

// ─── Study Collections ────────────────────────────────────────────────────────

export type StudyCollection = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: number;
  updatedAt: number;
};

export type CollectionItem = {
  id: string;
  collectionId: string;
  documentId: string;
  position: number;
  addedAt: number;
};

function rowToCollection(row: Record<string, unknown>): StudyCollection {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    color: (row.color as string) ?? "blue",
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToCollectionItem(row: Record<string, unknown>): CollectionItem {
  return {
    id: row.id as string,
    collectionId: row.collection_id as string,
    documentId: row.document_id as string,
    position: row.position as number,
    addedAt: row.added_at as number,
  };
}

export async function createCollection(
  userId: string,
  name: string,
  description: string | null,
  color: string,
): Promise<StudyCollection> {
  const now = Date.now();
  const { data, error } = await supabase
    .from("study_collections")
    .insert({
      id: randomId(),
      user_id: userId,
      name,
      description,
      color,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw new Error(`createCollection: ${error.message}`);
  return rowToCollection(data as Record<string, unknown>);
}

export async function listCollections(userId: string): Promise<StudyCollection[]> {
  const { data, error } = await supabase
    .from("study_collections")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listCollections: ${error.message}`);
  return (data ?? []).map((r) => rowToCollection(r as Record<string, unknown>));
}

export async function getCollection(
  id: string,
  userId: string,
): Promise<StudyCollection | null> {
  const { data, error } = await supabase
    .from("study_collections")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getCollection: ${error.message}`);
  if (!data) return null;
  return rowToCollection(data as Record<string, unknown>);
}

export async function updateCollection(
  id: string,
  userId: string,
  patch: { name?: string; description?: string | null; color?: string },
): Promise<StudyCollection> {
  const update: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.color !== undefined) update.color = patch.color;
  const { data, error } = await supabase
    .from("study_collections")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`updateCollection: ${error.message}`);
  return rowToCollection(data as Record<string, unknown>);
}

export async function deleteCollection(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("study_collections")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteCollection: ${error.message}`);
}

export async function listCollectionItems(
  collectionId: string,
  userId: string,
): Promise<CollectionItem[]> {
  // Verify ownership first — avoids leaking items from other users' collections
  const collection = await getCollection(collectionId, userId);
  if (!collection) return [];
  const { data, error } = await supabase
    .from("collection_items")
    .select("*")
    .eq("collection_id", collectionId)
    .order("position", { ascending: true });
  if (error) throw new Error(`listCollectionItems: ${error.message}`);
  return (data ?? []).map((r) => rowToCollectionItem(r as Record<string, unknown>));
}

export async function addDocumentToCollection(
  collectionId: string,
  documentId: string,
  userId: string,
): Promise<CollectionItem> {
  const collection = await getCollection(collectionId, userId);
  if (!collection) throw new Error("Collection not found or access denied");

  const { data: maxRow } = await supabase
    .from("collection_items")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxPosition = (maxRow?.position as number | null) ?? 0;
  const position = maxPosition + 1.0;

  const { data, error } = await supabase
    .from("collection_items")
    .insert({
      id: randomId(),
      collection_id: collectionId,
      document_id: documentId,
      position,
      added_at: Date.now(),
    })
    .select()
    .single();
  if (error) throw new Error(`addDocumentToCollection: ${error.message}`);
  return rowToCollectionItem(data as Record<string, unknown>);
}

export async function removeDocumentFromCollection(
  collectionId: string,
  documentId: string,
  userId: string,
): Promise<void> {
  const collection = await getCollection(collectionId, userId);
  if (!collection) throw new Error("Collection not found or access denied");
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("document_id", documentId);
  if (error) throw new Error(`removeDocumentFromCollection: ${error.message}`);
}

export async function reorderCollectionItem(
  itemId: string,
  collectionId: string,
  userId: string,
  newPosition: number,
): Promise<void> {
  const collection = await getCollection(collectionId, userId);
  if (!collection) throw new Error("Collection not found or access denied");
  const { error } = await supabase
    .from("collection_items")
    .update({ position: newPosition })
    .eq("id", itemId)
    .eq("collection_id", collectionId);
  if (error) throw new Error(`reorderCollectionItem: ${error.message}`);
}

// ─── Reviewer Notes ───────────────────────────────────────────────────────────

export type ReviewerNote = {
  id: string;
  userId: string;
  documentId: string;
  topicIndex: number;
  noteText: string;
  aiTags: string[] | null;
  confusionLevel: number | null;
  linkedConcepts: string[] | null;
  createdAt: number;
  updatedAt: number;
};

function rowToReviewerNote(row: Record<string, unknown>): ReviewerNote {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    documentId: row.document_id as string,
    topicIndex: row.topic_index as number,
    noteText: (row.note_text as string) ?? "",
    aiTags: (row.ai_tags as string[] | null) ?? null,
    confusionLevel: (row.confusion_level as number | null) ?? null,
    linkedConcepts: (row.linked_concepts as string[] | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export async function upsertNote(
  userId: string,
  documentId: string,
  topicIndex: number,
  noteText: string,
  confusionLevel?: number,
): Promise<ReviewerNote> {
  const now = Date.now();
  const { data, error } = await supabase
    .from("reviewer_notes")
    .upsert(
      {
        id: randomId(),
        user_id: userId,
        document_id: documentId,
        topic_index: topicIndex,
        note_text: noteText,
        confusion_level: confusionLevel ?? null,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,document_id,topic_index" },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertNote: ${error.message}`);
  return rowToReviewerNote(data as Record<string, unknown>);
}

export async function getNotesByDocument(
  userId: string,
  documentId: string,
): Promise<ReviewerNote[]> {
  const { data, error } = await supabase
    .from("reviewer_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("document_id", documentId);
  if (error) throw new Error(`getNotesByDocument: ${error.message}`);
  return (data ?? []).map((r) => rowToReviewerNote(r as Record<string, unknown>));
}

export async function deleteNote(
  userId: string,
  documentId: string,
  topicIndex: number,
): Promise<void> {
  const { error } = await supabase
    .from("reviewer_notes")
    .delete()
    .eq("user_id", userId)
    .eq("document_id", documentId)
    .eq("topic_index", topicIndex);
  if (error) throw new Error(`deleteNote: ${error.message}`);
}

// ─── Learning Analytics ───────────────────────────────────────────────────────

export async function insertLearningEvent(
  userId: string,
  documentId: string | null,
  eventType: string,
  eventData: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from("learning_analytics").insert({
      user_id: userId,
      document_id: documentId,
      event_type: eventType,
      event_data: eventData,
      recorded_at: Date.now(),
    });
    if (error) console.error(`insertLearningEvent: ${error.message}`);
  } catch (err) {
    console.error("insertLearningEvent unexpected error:", err);
  }
}

export async function getLearningEvents(
  userId: string,
  sinceTimestamp: number,
  limit = 200,
): Promise<Array<{ eventType: string; documentId: string | null; eventData: Record<string, unknown>; recordedAt: number }>> {
  const { data, error } = await supabase
    .from("learning_analytics")
    .select("event_type, document_id, event_data, recorded_at")
    .eq("user_id", userId)
    .gte("recorded_at", sinceTimestamp)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getLearningEvents: ${error.message}`);
  return (data ?? []).map((r) => ({
    eventType: r.event_type as string,
    documentId: (r.document_id as string | null) ?? null,
    eventData: (r.event_data as Record<string, unknown>) ?? {},
    recordedAt: r.recorded_at as number,
  }));
}

// ─── Reviewer Highlights ──────────────────────────────────────────────────────

export type ReviewerHighlight = {
  id: string;
  userId: string;
  documentId: string;
  topicIndex: number;
  fieldName: string;
  itemIndex: number;
  charStart: number;
  charEnd: number;
  colorTag: "yellow" | "green" | "blue" | "pink";
  isStale: boolean;
  createdAt: number;
};

function rowToHighlight(row: Record<string, unknown>): ReviewerHighlight {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    documentId: row.document_id as string,
    topicIndex: row.topic_index as number,
    fieldName: row.field_name as string,
    itemIndex: row.item_index as number,
    charStart: row.char_start as number,
    charEnd: row.char_end as number,
    colorTag: (row.color_tag as ReviewerHighlight["colorTag"]) ?? "yellow",
    isStale: (row.is_stale as boolean) ?? false,
    createdAt: row.created_at as number,
  };
}

export async function createHighlight(
  userId: string,
  documentId: string,
  topicIndex: number,
  fieldName: string,
  itemIndex: number,
  charStart: number,
  charEnd: number,
  colorTag: ReviewerHighlight["colorTag"],
): Promise<ReviewerHighlight> {
  const { data, error } = await supabase
    .from("reviewer_highlights")
    .insert({
      user_id: userId,
      document_id: documentId,
      topic_index: topicIndex,
      field_name: fieldName,
      item_index: itemIndex,
      char_start: charStart,
      char_end: charEnd,
      color_tag: colorTag,
      is_stale: false,
      created_at: Date.now(),
    })
    .select()
    .single();
  if (error) throw new Error(`createHighlight: ${error.message}`);
  return rowToHighlight(data as Record<string, unknown>);
}

export async function getHighlightsByDocument(
  documentId: string,
  userId: string,
): Promise<ReviewerHighlight[]> {
  const { data, error } = await supabase
    .from("reviewer_highlights")
    .select("*")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getHighlightsByDocument: ${error.message}`);
  return (data ?? []).map((r) => rowToHighlight(r as Record<string, unknown>));
}

export async function markHighlightsStale(
  documentId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("reviewer_highlights")
    .update({ is_stale: true })
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .eq("is_stale", false);
  if (error) throw new Error(`markHighlightsStale: ${error.message}`);
}

export async function deleteHighlight(
  id: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("reviewer_highlights")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteHighlight: ${error.message}`);
}

// ─── AI Companion Events ──────────────────────────────────────────────────────

export async function insertCompanionEvent(
  userId: string,
  documentId: string,
  topicIndex: number,
  triggerType: string,
  tokensInput: number,
  tokensOutput: number,
): Promise<void> {
  try {
    const { error } = await supabase.from("ai_companion_events").insert({
      id: randomId(),
      user_id: userId,
      document_id: documentId,
      topic_index: topicIndex,
      trigger_type: triggerType,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      created_at: Date.now(),
    });
    if (error) console.error(`insertCompanionEvent: ${error.message}`);
  } catch (err) {
    console.error("insertCompanionEvent unexpected error:", err);
  }
}

export async function getCompanionCallCount(
  userId: string,
  sinceTimestamp: number,
): Promise<number> {
  const { count, error } = await supabase
    .from("ai_companion_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceTimestamp);
  if (error) throw new Error(`getCompanionCallCount: ${error.message}`);
  return count ?? 0;
}

// ─── Study Planner ────────────────────────────────────────────────────────────

function rowToPlan(row: Record<string, unknown>): StudyPlan {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    examDate: row.exam_date as number,
    dailyHours: row.daily_hours as number,
    status: row.status as StudyPlan["status"],
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToPlanDoc(row: Record<string, unknown>): StudyPlanDocument {
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    documentId: row.document_id as string,
    priority: row.priority as number,
    weakTopicWeight: row.weak_topic_weight as number,
    paused: row.paused as boolean,
    addedAt: row.added_at as number,
  };
}

function rowToPlanItem(row: Record<string, unknown>): StudyPlanItem {
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    documentId: row.document_id as string,
    itemType: row.item_type as StudyPlanItem["itemType"],
    scheduledDate: row.scheduled_date as number,
    completedAt: (row.completed_at as number | null) ?? null,
    skippedAt: (row.skipped_at as number | null) ?? null,
    sectionIndices: (row.section_indices as number[]) ?? [],
    estimatedMins: row.estimated_mins as number,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    position: row.position as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToReviewEvent(row: Record<string, unknown>): ReviewScheduleEvent {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    planId: (row.plan_id as string | null) ?? null,
    documentId: row.document_id as string,
    eventType: row.event_type as ReviewScheduleEvent["eventType"],
    dueAt: row.due_at as number,
    intervalDays: row.interval_days as number,
    easeFactor: row.ease_factor as number,
    completedAt: (row.completed_at as number | null) ?? null,
    createdAt: row.created_at as number,
  };
}

export async function createStudyPlan(plan: StudyPlan): Promise<void> {
  const { error } = await supabase.from("study_plans").insert({
    id: plan.id,
    user_id: plan.userId,
    title: plan.title,
    exam_date: plan.examDate,
    daily_hours: plan.dailyHours,
    status: plan.status,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  });
  if (error) throw new Error(`createStudyPlan: ${error.message}`);
}

export async function getStudyPlan(planId: string, userId: string): Promise<StudyPlan | null> {
  const { data, error } = await supabase
    .from("study_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getStudyPlan: ${error.message}`);
  if (!data) return null;
  return rowToPlan(data as Record<string, unknown>);
}

export async function listStudyPlans(userId: string): Promise<StudyPlan[]> {
  const { data, error } = await supabase
    .from("study_plans")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listStudyPlans: ${error.message}`);
  return (data ?? []).map((r) => rowToPlan(r as Record<string, unknown>));
}

export async function updateStudyPlan(
  planId: string,
  userId: string,
  patch: Partial<Pick<StudyPlan, "title" | "examDate" | "dailyHours" | "status">>,
): Promise<StudyPlan> {
  const update: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.examDate !== undefined) update.exam_date = patch.examDate;
  if (patch.dailyHours !== undefined) update.daily_hours = patch.dailyHours;
  if (patch.status !== undefined) update.status = patch.status;

  const { data, error } = await supabase
    .from("study_plans")
    .update(update)
    .eq("id", planId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`updateStudyPlan: ${error.message}`);
  return rowToPlan(data as Record<string, unknown>);
}

export async function deleteStudyPlan(planId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("study_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteStudyPlan: ${error.message}`);
}

export async function addStudyPlanDocument(planDoc: StudyPlanDocument): Promise<void> {
  const { error } = await supabase.from("study_plan_documents").insert({
    id: planDoc.id,
    plan_id: planDoc.planId,
    document_id: planDoc.documentId,
    priority: planDoc.priority,
    weak_topic_weight: planDoc.weakTopicWeight,
    paused: planDoc.paused,
    added_at: planDoc.addedAt,
  });
  if (error) throw new Error(`addStudyPlanDocument: ${error.message}`);
}

export async function getStudyPlanDocuments(planId: string): Promise<StudyPlanDocument[]> {
  const { data, error } = await supabase
    .from("study_plan_documents")
    .select("*")
    .eq("plan_id", planId)
    .order("priority", { ascending: true });
  if (error) throw new Error(`getStudyPlanDocuments: ${error.message}`);
  return (data ?? []).map((r) => rowToPlanDoc(r as Record<string, unknown>));
}

export async function updateStudyPlanDocument(
  id: string,
  patch: { priority?: number; weakTopicWeight?: number; paused?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.weakTopicWeight !== undefined) update.weak_topic_weight = patch.weakTopicWeight;
  if (patch.paused !== undefined) update.paused = patch.paused;
  const { error } = await supabase.from("study_plan_documents").update(update).eq("id", id);
  if (error) throw new Error(`updateStudyPlanDocument: ${error.message}`);
}

export async function removeStudyPlanDocument(planId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from("study_plan_documents")
    .delete()
    .eq("plan_id", planId)
    .eq("document_id", documentId);
  if (error) throw new Error(`removeStudyPlanDocument: ${error.message}`);
}

export async function createStudyPlanItems(items: StudyPlanItem[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await supabase.from("study_plan_items").insert(
    items.map((item) => ({
      id: item.id,
      plan_id: item.planId,
      document_id: item.documentId,
      item_type: item.itemType,
      scheduled_date: item.scheduledDate,
      completed_at: item.completedAt,
      skipped_at: item.skippedAt,
      section_indices: item.sectionIndices,
      estimated_mins: item.estimatedMins,
      metadata: item.metadata,
      position: item.position,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    })),
  );
  if (error) throw new Error(`createStudyPlanItems: ${error.message}`);
}

export async function getStudyPlanItems(
  planId: string,
  options: { dateFrom?: number; dateTo?: number; includeCompleted?: boolean } = {},
): Promise<StudyPlanItem[]> {
  let q = supabase
    .from("study_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("scheduled_date", { ascending: true })
    .order("position", { ascending: true });

  if (options.dateFrom !== undefined) q = q.gte("scheduled_date", options.dateFrom);
  if (options.dateTo !== undefined) q = q.lte("scheduled_date", options.dateTo);
  if (!options.includeCompleted) {
    q = q.is("completed_at", null);
  }

  const { data, error } = await q;
  if (error) throw new Error(`getStudyPlanItems: ${error.message}`);
  return (data ?? []).map((r) => rowToPlanItem(r as Record<string, unknown>));
}

export async function updateStudyPlanItem(
  id: string,
  planId: string,
  patch: Partial<Pick<StudyPlanItem, "completedAt" | "skippedAt" | "scheduledDate" | "position">>,
): Promise<StudyPlanItem> {
  const update: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;
  if (patch.skippedAt !== undefined) update.skipped_at = patch.skippedAt;
  if (patch.scheduledDate !== undefined) update.scheduled_date = patch.scheduledDate;
  if (patch.position !== undefined) update.position = patch.position;

  const { data, error } = await supabase
    .from("study_plan_items")
    .update(update)
    .eq("id", id)
    .eq("plan_id", planId)
    .select()
    .single();
  if (error) throw new Error(`updateStudyPlanItem: ${error.message}`);
  return rowToPlanItem(data as Record<string, unknown>);
}

export async function deleteStudyPlanItemsByDocument(planId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from("study_plan_items")
    .delete()
    .eq("plan_id", planId)
    .eq("document_id", documentId)
    .is("completed_at", null); // keep completed items as history
  if (error) throw new Error(`deleteStudyPlanItemsByDocument: ${error.message}`);
}

export async function createReviewScheduleEvent(event: ReviewScheduleEvent): Promise<void> {
  const { error } = await supabase.from("review_schedule_events").insert({
    id: event.id,
    user_id: event.userId,
    plan_id: event.planId,
    document_id: event.documentId,
    event_type: event.eventType,
    due_at: event.dueAt,
    interval_days: event.intervalDays,
    ease_factor: event.easeFactor,
    completed_at: event.completedAt,
    created_at: event.createdAt,
  });
  if (error) throw new Error(`createReviewScheduleEvent: ${error.message}`);
}

export async function getDueReviewEvents(
  userId: string,
  beforeMs: number,
): Promise<ReviewScheduleEvent[]> {
  const { data, error } = await supabase
    .from("review_schedule_events")
    .select("*")
    .eq("user_id", userId)
    .lte("due_at", beforeMs)
    .is("completed_at", null)
    .order("due_at", { ascending: true });
  if (error) throw new Error(`getDueReviewEvents: ${error.message}`);
  return (data ?? []).map((r) => rowToReviewEvent(r as Record<string, unknown>));
}

export async function completeReviewEvent(
  id: string,
  userId: string,
): Promise<ReviewScheduleEvent> {
  const { data, error } = await supabase
    .from("review_schedule_events")
    .update({ completed_at: Date.now() })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`completeReviewEvent: ${error.message}`);
  return rowToReviewEvent(data as Record<string, unknown>);
}

export async function getUserPlanItemsInRange(
  userId: string,
  dateFrom: number,
  dateTo: number,
): Promise<StudyPlanItem[]> {
  const plans = await listStudyPlans(userId);
  const activePlanIds = plans.filter((p) => p.status === "active").map((p) => p.id);
  if (activePlanIds.length === 0) return [];

  const { data, error } = await supabase
    .from("study_plan_items")
    .select("*")
    .in("plan_id", activePlanIds)
    .gte("scheduled_date", dateFrom)
    .lte("scheduled_date", dateTo)
    .is("completed_at", null)
    .is("skipped_at", null)
    .order("scheduled_date", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw new Error(`getUserPlanItemsInRange: ${error.message}`);
  return (data ?? []).map((r) => rowToPlanItem(r as Record<string, unknown>));
}

export async function getMaxConfusionByDocument(
  userId: string,
  documentIds: string[],
): Promise<Record<string, number>> {
  if (documentIds.length === 0) return {};
  const { data, error } = await supabase
    .from("reviewer_notes")
    .select("document_id, confusion_level")
    .eq("user_id", userId)
    .in("document_id", documentIds)
    .not("confusion_level", "is", null);
  if (error) throw new Error(`getMaxConfusionByDocument: ${error.message}`);
  const result: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const docId = r.document_id as string;
    const level = r.confusion_level as number;
    result[docId] = Math.max(result[docId] ?? 0, level);
  }
  return result;
}

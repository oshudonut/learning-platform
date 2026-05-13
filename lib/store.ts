import crypto from "crypto";
import { supabase } from "./supabase";
import type {
  Document,
  Analytics,
  QuizAttempt,
  FlashcardSession,
  Conversation,
  FlashcardReviewState,
  TextChunk,
} from "./types";

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

export async function getDocument(id: string): Promise<Document | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getDocument: ${error.message}`);
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function updateDocument(
  id: string,
  patch: Partial<Document>,
): Promise<Document> {
  const existing = await getDocument(id);
  if (!existing) throw new Error(`Document ${id} not found`);
  const updated = { ...existing, ...patch };
  await saveDocument(updated);
  return updated;
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw new Error(`deleteDocument: ${error.message}`);
}

export async function listDocuments(): Promise<
  Array<Omit<Document, "text" | "reviewer" | "quiz" | "flashcards">>
> {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, title, filename, text_length, content_hash, created_at, flashcard_review_states, chunks, reviewer, quiz, flashcards",
    )
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
  states: FlashcardReviewState[],
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ flashcard_review_states: states })
    .eq("id", docId);
  if (error) throw new Error(`saveFlashcardReviewStates: ${error.message}`);
}

export async function getFlashcardReviewStates(
  docId: string,
): Promise<FlashcardReviewState[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("flashcard_review_states")
    .eq("id", docId)
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
  chunks: TextChunk[],
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ chunks })
    .eq("id", docId);
  if (error) throw new Error(`saveChunks: ${error.message}`);
}

/**
 * Retrieve the pre-computed chunks for a document.
 *
 * Returns an empty array when the document has no chunks yet (e.g. uploaded
 * before chunking was introduced) so callers can handle the missing-chunks
 * case without branching on undefined.
 */
export async function getChunks(docId: string): Promise<TextChunk[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("chunks")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw new Error(`getChunks: ${error.message}`);
  return (data?.chunks as TextChunk[] | null) ?? [];
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function saveConversation(conv: Conversation): Promise<void> {
  const { error } = await supabase.from("conversations").upsert({
    id: conv.id,
    document_id: conv.documentId,
    document_title: conv.documentTitle,
    messages: conv.messages,
    created_at: conv.createdAt,
    updated_at: conv.updatedAt,
  });
  if (error) throw new Error(`saveConversation: ${error.message}`);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
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
  documentId?: string,
): Promise<Conversation[]> {
  let query = supabase
    .from("conversations")
    .select("*")
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

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id);
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

export async function recordQuizAttempt(attempt: QuizAttempt): Promise<void> {
  const { error: insertError } = await supabase.from("quiz_attempts").insert({
    quiz_id: attempt.quizId,
    document_id: attempt.documentId,
    document_title: attempt.documentTitle,
    score: attempt.score,
    total_questions: attempt.totalQuestions,
    correct_answers: attempt.correctAnswers,
    weak_topics: attempt.weakTopics,
    completed_at: attempt.completedAt,
  });
  if (insertError) throw new Error(`recordQuizAttempt insert: ${insertError.message}`);

  const { data: meta, error: metaError } = await supabase
    .from("analytics_meta")
    .select("study_streak, last_studied, total_study_time")
    .eq("id", 1)
    .single();
  if (metaError) throw new Error(`recordQuizAttempt meta read: ${metaError.message}`);

  const m = meta as { study_streak: number; last_studied: number | null; total_study_time: number };
  const newStreak = calcStreak(m.study_streak, m.last_studied);
  const now = Date.now();

  const { error: upsertError } = await supabase.from("analytics_meta").upsert({
    id: 1,
    study_streak: newStreak,
    last_studied: now,
    total_study_time: m.total_study_time + 5,
  });
  if (upsertError) throw new Error(`recordQuizAttempt meta upsert: ${upsertError.message}`);
}

export async function recordFlashcardSession(
  session: FlashcardSession,
): Promise<void> {
  const { error: insertError } = await supabase
    .from("flashcard_sessions")
    .insert({
      document_id: session.documentId,
      document_title: session.documentTitle,
      cards_studied: session.cardsStudied,
      avg_quality: session.avgQuality,
      completed_at: session.completedAt,
    });
  if (insertError)
    throw new Error(`recordFlashcardSession insert: ${insertError.message}`);

  const { data: meta, error: metaError } = await supabase
    .from("analytics_meta")
    .select("study_streak, last_studied, total_study_time")
    .eq("id", 1)
    .single();
  if (metaError)
    throw new Error(`recordFlashcardSession meta read: ${metaError.message}`);

  const m = meta as { study_streak: number; last_studied: number | null; total_study_time: number };
  const newStreak = calcStreak(m.study_streak, m.last_studied);
  const now = Date.now();

  const { error: upsertError } = await supabase.from("analytics_meta").upsert({
    id: 1,
    study_streak: newStreak,
    last_studied: now,
    total_study_time: m.total_study_time + Math.ceil(session.cardsStudied * 0.5),
  });
  if (upsertError)
    throw new Error(`recordFlashcardSession meta upsert: ${upsertError.message}`);
}

export async function getAnalytics(): Promise<Analytics> {
  const [quizRes, flashRes, metaRes] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("*")
      .order("completed_at", { ascending: false }),
    supabase
      .from("flashcard_sessions")
      .select("*")
      .order("completed_at", { ascending: false }),
    supabase
      .from("analytics_meta")
      .select("study_streak, last_studied, total_study_time")
      .eq("id", 1)
      .single(),
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
  };

  return {
    quizAttempts,
    flashcardSessions,
    studyStreak: m.study_streak,
    lastStudied: m.last_studied,
    totalStudyTime: m.total_study_time,
  };
}

// ─── Content hash ─────────────────────────────────────────────────────────────

export function computeContentHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

export async function getDocumentByContentHash(
  hash: string,
): Promise<Document | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("content_hash", hash)
    .maybeSingle();
  if (error) throw new Error(`getDocumentByContentHash: ${error.message}`);
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

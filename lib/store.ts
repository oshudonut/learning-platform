import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type {
  Document,
  Analytics,
  QuizAttempt,
  FlashcardSession,
  Conversation,
  FlashcardReviewState,
  TextChunk,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const ANALYTICS_FILE = path.join(DATA_DIR, "_analytics.json");
const CONVERSATIONS_FILE = path.join(DATA_DIR, "_conversations.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function safeId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid id");
  return id;
}

function docPath(id: string) {
  return path.join(DATA_DIR, `${safeId(id)}.json`);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function saveDocument(doc: Document): Promise<void> {
  await ensureDir();
  await fs.writeFile(docPath(doc.id), JSON.stringify(doc, null, 2), "utf8");
}

export async function getDocument(id: string): Promise<Document | null> {
  try {
    const raw = await fs.readFile(docPath(id), "utf8");
    return JSON.parse(raw) as Document;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
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
  try {
    await fs.unlink(docPath(id));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function listDocuments(): Promise<
  Array<Omit<Document, "text" | "reviewer" | "quiz" | "flashcards">>
> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const docs = await Promise.all(
    files
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map(async (f) => {
        try {
          const raw = await fs.readFile(path.join(DATA_DIR, f), "utf8");
          const doc = JSON.parse(raw) as Document;
          const { text: _text, reviewer, quiz, flashcards, ...meta } = doc;
          return {
            ...meta,
            hasReviewer: Boolean(reviewer),
            hasQuiz: Boolean(quiz),
            hasFlashcards: Boolean(flashcards?.length),
            conceptCount: reviewer?.topics?.length ?? 0,
            questionCount: quiz?.questions?.length ?? 0,
            flashcardCount: flashcards?.length ?? 0,
          };
        } catch {
          return null;
        }
      }),
  );
  return docs
    .filter(Boolean)
    .sort((a, b) => (b!.createdAt ?? 0) - (a!.createdAt ?? 0)) as Array<
    Omit<Document, "text" | "reviewer" | "quiz" | "flashcards">
  >;
}

// ─── Flashcard review states ───────────────────────────────────────────────────

export async function saveFlashcardReviewStates(
  docId: string,
  states: FlashcardReviewState[],
): Promise<void> {
  const doc = await getDocument(docId);
  if (!doc) throw new Error(`Document ${docId} not found`);
  await updateDocument(docId, { flashcardReviewStates: states });
}

export async function getFlashcardReviewStates(
  docId: string,
): Promise<FlashcardReviewState[]> {
  const doc = await getDocument(docId);
  return doc?.flashcardReviewStates ?? [];
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
  const doc = await getDocument(docId);
  if (!doc) throw new Error(`Document ${docId} not found`);
  await updateDocument(docId, { chunks });
}

/**
 * Retrieve the pre-computed chunks for a document.
 *
 * Returns an empty array when the document has no chunks yet (e.g. uploaded
 * before chunking was introduced) so callers can handle the missing-chunks
 * case without branching on undefined.
 */
export async function getChunks(docId: string): Promise<TextChunk[]> {
  const doc = await getDocument(docId);
  return doc?.chunks ?? [];
}

// ─── Conversations ────────────────────────────────────────────────────────────

async function readConversations(): Promise<Record<string, Conversation>> {
  try {
    const raw = await fs.readFile(CONVERSATIONS_FILE, "utf8");
    return JSON.parse(raw) as Record<string, Conversation>;
  } catch {
    return {};
  }
}

async function writeConversations(
  convs: Record<string, Conversation>,
): Promise<void> {
  await ensureDir();
  await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(convs, null, 2), "utf8");
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const convs = await readConversations();
  convs[conv.id] = conv;
  await writeConversations(convs);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const convs = await readConversations();
  return convs[id] ?? null;
}

export async function listConversations(
  documentId?: string,
): Promise<Conversation[]> {
  const convs = await readConversations();
  const all = Object.values(convs).sort((a, b) => b.updatedAt - a.updatedAt);
  if (documentId) return all.filter((c) => c.documentId === documentId);
  return all;
}

export async function deleteConversation(id: string): Promise<void> {
  const convs = await readConversations();
  delete convs[id];
  await writeConversations(convs);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

async function readAnalytics(): Promise<Analytics> {
  try {
    const raw = await fs.readFile(ANALYTICS_FILE, "utf8");
    return JSON.parse(raw) as Analytics;
  } catch {
    return {
      quizAttempts: [],
      flashcardSessions: [],
      studyStreak: 0,
      lastStudied: null,
      totalStudyTime: 0,
    };
  }
}

async function writeAnalytics(a: Analytics): Promise<void> {
  await ensureDir();
  await fs.writeFile(ANALYTICS_FILE, JSON.stringify(a, null, 2), "utf8");
}

export async function recordQuizAttempt(attempt: QuizAttempt): Promise<void> {
  const analytics = await readAnalytics();
  analytics.quizAttempts.push(attempt);
  analytics.lastStudied = Date.now();
  analytics.totalStudyTime += 5; // estimate 5 min per quiz
  updateStreak(analytics);
  await writeAnalytics(analytics);
}

export async function recordFlashcardSession(
  session: FlashcardSession,
): Promise<void> {
  const analytics = await readAnalytics();
  analytics.flashcardSessions.push(session);
  analytics.lastStudied = Date.now();
  analytics.totalStudyTime += Math.ceil(session.cardsStudied * 0.5);
  updateStreak(analytics);
  await writeAnalytics(analytics);
}

export async function getAnalytics(): Promise<Analytics> {
  return readAnalytics();
}

function updateStreak(analytics: Analytics): void {
  const now = Date.now();
  const oneDayMs = 86_400_000;
  if (!analytics.lastStudied) {
    analytics.studyStreak = 1;
  } else {
    const daysSince = Math.floor((now - analytics.lastStudied) / oneDayMs);
    if (daysSince === 0) {
      // Same day, streak unchanged
    } else if (daysSince === 1) {
      analytics.studyStreak += 1;
    } else {
      analytics.studyStreak = 1;
    }
  }
}

// ─── Content hash ─────────────────────────────────────────────────────────────

export function computeContentHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

export async function getDocumentByContentHash(hash: string): Promise<Document | null> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  for (const f of files) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), "utf8");
      const doc = JSON.parse(raw) as Document;
      if (doc.contentHash === hash) return doc;
    } catch {
      continue;
    }
  }
  return null;
}

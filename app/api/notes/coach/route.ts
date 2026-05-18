import { NextRequest, NextResponse } from "next/server";
import { claude, HAIKU_MODEL } from "@/lib/claude";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 20;

// ── In-memory rate limiter (15 calls / 3 min per user) ───────────────────────
const RL_MAP = new Map<string, { count: number; windowStart: number }>();
const RL_WINDOW = 3 * 60 * 1000;
const RL_MAX = 15;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = RL_MAP.get(userId);
  if (!entry || now - entry.windowStart > RL_WINDOW) {
    RL_MAP.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RL_MAX) return true;
  entry.count++;
  return false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type NoteCoachResult = {
  correction: string | null;
  clarification: string | null;
  suggestedRewrite: string | null;
  examTip: string | null;
  retentionHook: string | null;
};

type TopicContent = {
  coreIdea: string;
  keyPoints: string[];
  mustMemorize: string[];
  boardTips: string[];
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a board-exam study coach analyzing a student's handwritten note.

Your job:
- Compare the note against the reference topic content
- Detect misconceptions, vague phrasing, or memorization without comprehension
- Suggest improvements that deepen understanding, not just fix grammar

Rules:
- Ground every response in the provided topic content — never invent facts
- Be a mentor, not a spell-checker
- Preserve student voice in rewrites
- Each field: 1–2 sentences max (concise)
- If a field is not applicable, return null
- Return ONLY valid JSON — no explanation, no markdown fences`;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  noteText: string,
  topicTitle: string,
  topic: TopicContent,
  studyMode?: string,
): string {
  const kp = topic.keyPoints.slice(0, 4).map((p) => `• ${p.slice(0, 120)}`).join("\n");
  const mm = topic.mustMemorize.slice(0, 3).map((p) => `• ${p.slice(0, 100)}`).join("\n");
  const tips = topic.boardTips.slice(0, 2).map((t) => `• ${t.slice(0, 100)}`).join("\n");

  const modeNote = studyMode === "board_exam"
    ? "Focus heavily on exam traps and high-yield precision."
    : studyMode === "cram"
      ? "Prioritize the most essential corrections only."
      : "";

  return `Topic: ${topicTitle}
${modeNote ? `\nContext: ${modeNote}` : ""}

Reference Content:
Core Idea: ${topic.coreIdea.slice(0, 200)}
${kp ? `Key Points:\n${kp}` : ""}
${mm ? `Must Memorize:\n${mm}` : ""}
${tips ? `Board Tips:\n${tips}` : ""}

Student's Note:
"${noteText.slice(0, 400)}"

Analyze this note. Return only this JSON object:
{
  "correction": <string or null>,
  "clarification": <string or null>,
  "suggestedRewrite": <string or null>,
  "examTip": <string or null>,
  "retentionHook": <string or null>
}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (isRateLimited(user.id)) {
      return NextResponse.json({ limited: true, result: null }, { status: 200 });
    }

    const body = await req.json() as {
      noteText?: string;
      topicTitle?: string;
      topicContent?: TopicContent;
      studyMode?: string;
    };

    const { noteText, topicTitle, topicContent, studyMode } = body;

    if (!noteText?.trim() || !topicTitle || !topicContent) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (noteText.trim().length < 20) {
      return NextResponse.json({ result: null }, { status: 200 });
    }

    const prompt = buildPrompt(noteText, topicTitle, topicContent, studyMode);

    const response = await claude.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }, { signal: AbortSignal.timeout(15_000) });

    const raw = response.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("").trim();

    let result: NoteCoachResult;
    try {
      // Strip possible code fences the model might sneak in
      const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
      const parsed = JSON.parse(cleaned) as Partial<NoteCoachResult>;
      result = {
        correction: typeof parsed.correction === "string" ? parsed.correction : null,
        clarification: typeof parsed.clarification === "string" ? parsed.clarification : null,
        suggestedRewrite: typeof parsed.suggestedRewrite === "string" ? parsed.suggestedRewrite : null,
        examTip: typeof parsed.examTip === "string" ? parsed.examTip : null,
        retentionHook: typeof parsed.retentionHook === "string" ? parsed.retentionHook : null,
      };
    } catch {
      console.error("[notes/coach] JSON parse failed:", raw.slice(0, 200));
      return NextResponse.json({ result: null }, { status: 200 });
    }

    return NextResponse.json({ result });
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === "AbortError" || name === "TimeoutError") {
      return NextResponse.json({ result: null }, { status: 200 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[notes/coach] error:", message);
    return NextResponse.json({ result: null }, { status: 200 });
  }
}

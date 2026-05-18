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
  // Initial analysis fields
  correction: string | null;
  clarification: string | null;
  suggestedRewrite: string | null;
  examTip: string | null;
  retentionHook: string | null;
  // Recheck-only comparison fields
  improvementDetected: string | null;
  remainingWeakness: string | null;
  confidenceShift: string | null;
  nextLevelInsight: string | null;
};

type TopicContent = {
  coreIdea: string;
  keyPoints: string[];
  mustMemorize: string[];
  boardTips: string[];
};

// ── Initial analysis ──────────────────────────────────────────────────────────

const INITIAL_SYSTEM = `You are a board-exam study coach analyzing a student's handwritten note.

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

function buildInitialPrompt(
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
  "retentionHook": <string or null>,
  "improvementDetected": null,
  "remainingWeakness": null,
  "confidenceShift": null,
  "nextLevelInsight": null
}`;
}

// ── Recheck (comparison) analysis ─────────────────────────────────────────────

const RECHECK_SYSTEM = `You are a board-exam study coach evaluating whether a student's understanding improved after revision.

Your job:
- Compare the PREVIOUS note to the UPDATED note
- Evaluate conceptual improvement, not just wording changes
- Be specific: what got better, what still needs work
- Act like a tutor reviewing a resubmission, not a grammar checker running again

Rules:
- Ground all feedback in the reference topic content — never invent facts
- Be honest: if understanding did NOT improve, say so clearly but constructively
- Be encouraging and precise
- Each field: 1–2 sentences max
- If a field is not applicable, return null
- Return ONLY valid JSON — no explanation, no markdown fences`;

function buildRecheckPrompt(
  previousNoteText: string,
  noteText: string,
  topicTitle: string,
  topic: TopicContent,
  studyMode?: string,
): string {
  const kp = topic.keyPoints.slice(0, 3).map((p) => `• ${p.slice(0, 100)}`).join("\n");

  const modeNote = studyMode === "board_exam"
    ? "Focus on board-exam precision and clinical accuracy."
    : "";

  return `Topic: ${topicTitle}
${modeNote ? `\nContext: ${modeNote}` : ""}

Reference Content:
Core Idea: ${topic.coreIdea.slice(0, 180)}
${kp ? `Key Points:\n${kp}` : ""}

Previous Note:
"${previousNoteText.slice(0, 300)}"

Updated Note:
"${noteText.slice(0, 400)}"

Evaluate the improvement. Return only this JSON object:
{
  "improvementDetected": <string or null — what specific understanding or phrasing improved>,
  "remainingWeakness": <string or null — what misconception or gap still exists in the updated note>,
  "confidenceShift": <string or null — one-line summary of how readiness changed, e.g. "confused → mostly clear">,
  "nextLevelInsight": <string or null — board-exam depth the student should aim for next>,
  "correction": <string or null — any remaining factual errors in the updated note>,
  "clarification": <string or null — key concept that still needs deeper understanding>,
  "suggestedRewrite": <string or null — final board-style phrasing if still imprecise>,
  "examTip": <string or null>,
  "retentionHook": <string or null>
}`;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseResult(raw: string): NoteCoachResult | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<NoteCoachResult>;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      correction: str(parsed.correction),
      clarification: str(parsed.clarification),
      suggestedRewrite: str(parsed.suggestedRewrite),
      examTip: str(parsed.examTip),
      retentionHook: str(parsed.retentionHook),
      improvementDetected: str(parsed.improvementDetected),
      remainingWeakness: str(parsed.remainingWeakness),
      confidenceShift: str(parsed.confidenceShift),
      nextLevelInsight: str(parsed.nextLevelInsight),
    };
  } catch {
    return null;
  }
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
      previousNoteText?: string;
      mode?: "initial" | "recheck";
      topicTitle?: string;
      topicContent?: TopicContent;
      studyMode?: string;
    };

    const { noteText, previousNoteText, mode = "initial", topicTitle, topicContent, studyMode } = body;

    if (!noteText?.trim() || !topicTitle || !topicContent) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (noteText.trim().length < 20) {
      return NextResponse.json({ result: null }, { status: 200 });
    }

    const isRecheck = mode === "recheck" && previousNoteText?.trim();

    const [system, prompt, maxTokens] = isRecheck
      ? [RECHECK_SYSTEM, buildRecheckPrompt(previousNoteText!, noteText, topicTitle, topicContent, studyMode), 900]
      : [INITIAL_SYSTEM, buildInitialPrompt(noteText, topicTitle, topicContent, studyMode), 700];

    const response = await claude.messages.create({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }, { signal: AbortSignal.timeout(15_000) });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    const result = parseResult(raw);
    if (!result) {
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

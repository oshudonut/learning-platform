import { NextRequest } from "next/server";
import { claude, HAIKU_MODEL } from "@/lib/claude";
import { getDocument, insertCompanionEvent, getCompanionCallCount } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const DAILY_LIMIT = 20;

// ── System prompt ─────────────────────────────────────────────────────────────

const COMPANION_SYSTEM = `You are a board-exam study companion for medical students.
Your role: clarify confusing topics and reinforce high-yield knowledge.
Rules:
- Under 200 words total.
- Use a clinical analogy when it helps.
- Be direct — address the student's specific situation.
- End with exactly one "**Key Takeaway:**" line (one sentence max).`;

// ── User prompt builders ──────────────────────────────────────────────────────

type TopicData = {
  title: string;
  coreIdea: string;
  keyPoints: string[];
  mustMemorize: string[];
  boardTips: string[];
};

function buildPrompt(
  trigger: string,
  topic: TopicData,
  noteText?: string,
  confusionLevel?: number,
): string {
  const kp = topic.keyPoints.slice(0, 3).map((p) => `• ${p.slice(0, 120)}`).join("\n");
  const mm = topic.mustMemorize.slice(0, 3).map((p) => `• ${p.slice(0, 100)}`).join("\n");

  const topicBlock = [
    `**Topic:** ${topic.title}`,
    `**Core Idea:** ${topic.coreIdea.slice(0, 200)}`,
    kp ? `**Key Points:**\n${kp}` : "",
    mm ? `**Must Memorize:**\n${mm}` : "",
  ].filter(Boolean).join("\n\n");

  if (trigger === "confusion" && noteText?.trim()) {
    return `${topicBlock}

**My confusion (level ${confusionLevel ?? "?"}/5):** "${noteText.slice(0, 300)}"

Address my specific confusion. Explain the mechanism clearly with a clinical analogy.`;
  }

  return `${topicBlock}

Explain this topic clearly with a clinical analogy. Focus on why it matters clinically, not just what to memorize.`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      documentId?: string;
      topicIndex?: number;
      triggerType?: string;
      topic?: TopicData;
      noteText?: string;
      confusionLevel?: number;
    };

    const { documentId, topicIndex, triggerType, topic, noteText, confusionLevel } = body;

    if (!documentId || topicIndex === undefined || !triggerType || !topic) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify document ownership
    const doc = await getDocument(documentId, user.id);
    if (!doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limit: max DAILY_LIMIT calls per calendar day (UTC)
    const now = Date.now();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const callCount = await getCompanionCallCount(user.id, startOfDay.getTime());

    if (callCount >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: `Daily limit of ${DAILY_LIMIT} AI companion calls reached. Try again tomorrow.` }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    const prompt = buildPrompt(triggerType, topic, noteText, confusionLevel);

    const stream = await claude.messages.stream({
      model: HAIKU_MODEL,
      max_tokens: 400,
      system: COMPANION_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    let tokensInput = 0;
    let tokensOutput = 0;
    let fullResponse = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        const enqueue = (obj: Record<string, unknown>) =>
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n`));

        try {
          enqueue({ ok: true });

          for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              const text = chunk.delta.text;
              fullResponse += text;
              enqueue({ text });
            }
            if (chunk.type === "message_delta" && chunk.usage) {
              tokensOutput = chunk.usage.output_tokens ?? 0;
            }
            if (chunk.type === "message_start" && chunk.message.usage) {
              tokensInput = chunk.message.usage.input_tokens ?? 0;
            }
          }

          // Record event (non-blocking — failure does not affect the response)
          void insertCompanionEvent(user.id, documentId, topicIndex, triggerType, tokensInput, tokensOutput);

          enqueue({ done: true, tokensUsed: tokensInput + tokensOutput });
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[companion] streaming error:", msg);
          enqueue({ error: "AI companion unavailable. Please try again." });
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

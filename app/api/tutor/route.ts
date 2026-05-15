import { NextRequest } from "next/server";
import {
  streamTutorResponse,
  retrieveContext,
} from "@/lib/claude";
import {
  TUTOR_SYSTEM,
  TUTOR_WITH_CONTEXT,
} from "@/lib/prompts";
import { getDocument, saveConversation, getConversation, getProgression } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import { randomId } from "@/lib/utils";
import type { TutorMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const body = (await req.json()) as {
      message: string;
      conversationId?: string;
      documentId?: string;
    };

    const { message, conversationId, documentId } = body;

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Load or create conversation
    let conversation = conversationId
      ? await getConversation(conversationId, user.id)
      : null;

    const convId = conversation?.id ?? randomId();

    // Load document context if provided
    let systemPrompt = TUTOR_SYSTEM;
    let docTitle: string | null = null;

    if (documentId) {
      const doc = await getDocument(documentId, user.id);
      if (doc) {
        docTitle = doc.title;
        const context = retrieveContext(doc.text, message);
        const progression = await getProgression(documentId, user.id);
        systemPrompt = TUTOR_WITH_CONTEXT(context, doc.title, progression?.learningMethod ?? undefined);
      }
    }

    // Build message history for API (last 20 messages to limit tokens)
    const history = (conversation?.messages ?? [])
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    // Stream the response
    const stream = await streamTutorResponse({
      systemPrompt,
      messages: [...history, { role: "user", content: message }],
    });

    // Collect full response for storage
    let fullResponse = "";
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send conversation ID first so client can track it
          const meta = JSON.stringify({ conversationId: convId }) + "\n";
          controller.enqueue(new TextEncoder().encode(`data: ${meta}\n`));

          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              const text = chunk.delta.text;
              fullResponse += text;
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ text })}\n`,
                ),
              );
            }
          }

          // Save the conversation
          const userMsg: TutorMessage = {
            role: "user",
            content: message,
            timestamp: Date.now(),
          };
          const assistantMsg: TutorMessage = {
            role: "assistant",
            content: fullResponse,
            timestamp: Date.now(),
          };

          const updatedMessages = [
            ...(conversation?.messages ?? []),
            userMsg,
            assistantMsg,
          ];

          await saveConversation({
            id: convId,
            documentId: documentId ?? null,
            documentTitle: docTitle,
            messages: updatedMessages,
            createdAt: conversation?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          }, user.id);

          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n`),
          );
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ error: msg })}\n`),
          );
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
    console.error("[tutor] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

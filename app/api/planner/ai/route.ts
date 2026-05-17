export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  buildPlannerContext,
  analyzePlannerContext,
  buildPlannerChatSystemPrompt,
  generateOptimizationPlan,
} from "@/lib/plannerAI";
import { claude, HAIKU_MODEL } from "@/lib/claude";

type Action = "analyze" | "chat" | "briefing" | "optimize";

// POST /api/planner/ai
// Body: { action: Action, planId: string, messages?: ChatMessage[] }
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      action?: Action;
      planId?: string;
      messages?: Array<{ role: "user" | "assistant"; content: string }>;
    };

    const { action, planId } = body;
    if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });
    if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

    const ctx = await buildPlannerContext(planId, user.id);
    if (!ctx) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    // ── analyze ──────────────────────────────────────────────────────────────
    if (action === "analyze") {
      const analysis = await analyzePlannerContext(ctx);
      return NextResponse.json({ analysis });
    }

    // ── briefing ─────────────────────────────────────────────────────────────
    if (action === "briefing") {
      const analysis = await analyzePlannerContext(ctx);
      return NextResponse.json({ briefing: analysis.briefing, readinessScore: analysis.readinessScore, readinessLabel: analysis.readinessLabel });
    }

    // ── optimize ─────────────────────────────────────────────────────────────
    if (action === "optimize") {
      const optimization = await generateOptimizationPlan(ctx);
      return NextResponse.json({ optimization });
    }

    // ── chat (streaming SSE) ─────────────────────────────────────────────────
    if (action === "chat") {
      const history = body.messages ?? [];
      if (history.length === 0 || history[history.length - 1]?.role !== "user") {
        return NextResponse.json({ error: "messages must end with a user turn" }, { status: 400 });
      }

      const systemPrompt = buildPlannerChatSystemPrompt(ctx);

      // Return a ReadableStream (SSE text/event-stream)
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const response = await claude.messages.stream({
              model: HAIKU_MODEL,
              max_tokens: 600,
              system: systemPrompt,
              messages: history,
            });

            for await (const chunk of response) {
              if (
                chunk.type === "content_block_delta" &&
                chunk.delta.type === "text_delta"
              ) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "Stream error" })}\n\n`),
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

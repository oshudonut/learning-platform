import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/claude";
import { QUIZ_TASK, SYSTEM_PREAMBLE } from "@/lib/prompts";
import { getDocument, updateDocument } from "@/lib/store";
import { QuizSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { id, force } = (await req.json()) as { id?: string; force?: boolean };
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const doc = await getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (doc.quiz && !force) {
      return NextResponse.json({ quiz: doc.quiz, cached: true });
    }

    const { parsed, cacheReadTokens, cacheWriteTokens } = await generateStructured({
      schema: QuizSchema,
      systemPreamble: SYSTEM_PREAMBLE,
      documentText: doc.text,
      taskInstruction: QUIZ_TASK,
      maxTokens: 6000,
    });

    await updateDocument(id, { quiz: parsed });

    return NextResponse.json({
      quiz: parsed,
      cached: false,
      usage: { cacheReadTokens, cacheWriteTokens },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quiz] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

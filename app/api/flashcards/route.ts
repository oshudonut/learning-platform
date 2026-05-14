import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/claude";
import { FLASHCARD_TASK, SYSTEM_PREAMBLE } from "@/lib/prompts";
import { getDocument, updateDocument } from "@/lib/store";
import { FlashcardsSchema } from "@/lib/types";

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

    if (doc.flashcards?.length && !force) {
      return NextResponse.json({ flashcards: doc.flashcards, cached: true });
    }

    const { parsed, cacheReadTokens, cacheWriteTokens } = await generateStructured({
      schema: FlashcardsSchema,
      systemPreamble: SYSTEM_PREAMBLE,
      documentText: doc.text,
      taskInstruction: FLASHCARD_TASK,
      maxTokens: 10000,
    });

    await updateDocument(id, { flashcards: parsed.cards });

    return NextResponse.json({
      flashcards: parsed.cards,
      cached: false,
      usage: { cacheReadTokens, cacheWriteTokens },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[flashcards] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

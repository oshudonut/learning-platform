import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/claude";
import { SYSTEM_PREAMBLE, buildQuizTask } from "@/lib/prompts";
import { getDocument, updateDocument, getProgression } from "@/lib/store";
import { ExtendedQuizSchema } from "@/lib/types";
import type { QuizDifficultyLevel } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      force?: boolean;
      difficultyLevel?: QuizDifficultyLevel;
      weakTopics?: string[];
    };
    const { id, force } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const doc = await getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Check quiz lock
    const progression = await getProgression(doc.id);
    if (progression && !progression.quizUnlocked) {
      return NextResponse.json({ error: "Quiz locked", locked: true }, { status: 423 });
    }

    // Skip cache if questions are in old format (no `type` field) — force regen
    const cachedIsExtended = doc.quiz && Array.isArray((doc.quiz as { questions?: unknown[] }).questions) &&
      typeof ((doc.quiz as { questions?: { type?: unknown }[] }).questions?.[0]?.type) === "string";
    if (doc.quiz && !force && cachedIsExtended) {
      return NextResponse.json({ quiz: doc.quiz, cached: true });
    }

    const difficultyLevel = body.difficultyLevel ?? "beginner";
    const weakTopics = body.weakTopics ?? [];
    const taskInstruction = buildQuizTask({ difficultyLevel, weakTopics });

    const { parsed, cacheReadTokens, cacheWriteTokens } = await generateStructured({
      schema: ExtendedQuizSchema,
      systemPreamble: SYSTEM_PREAMBLE,
      documentText: doc.text,
      taskInstruction,
      maxTokens: 6000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDocument(id, { quiz: parsed as any });

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

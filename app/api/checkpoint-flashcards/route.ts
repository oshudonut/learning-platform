import { NextRequest, NextResponse } from "next/server";
import { getCheckpointFlashcards, saveCheckpointFlashcards, getDocument, getProgression, upsertProgression } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import { generateStructured } from "@/lib/claude";
import { buildCheckpointFlashcardTask, SYSTEM_PREAMBLE } from "@/lib/prompts";
import { FlashcardsSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, documentId, checkpointIndex } = body as { action: string; documentId: string; checkpointIndex: number };

    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

    if (action === "get") {
      const doc = await getDocument(documentId, user.id);
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const cards = await getCheckpointFlashcards(documentId, checkpointIndex, user.id);
      return NextResponse.json({ cards });
    }

    if (action === "generate") {
      const existing = await getCheckpointFlashcards(documentId, checkpointIndex, user.id);
      if (existing && !body.force) return NextResponse.json({ cards: existing });

      const doc = await getDocument(documentId, user.id);
      if (!doc?.reviewer) return NextResponse.json({ error: "No reviewer found" }, { status: 404 });

      const progression = await getProgression(documentId, user.id);
      const cp = progression?.checkpointStatuses[checkpointIndex];
      const coveredIndices = cp?.sectionsCovered ?? [];
      const coveredTopics = coveredIndices
        .map(i => doc.reviewer!.topics[i])
        .filter(Boolean);

      const topicTitles = coveredTopics.map(t => t.title);
      const topicContent = JSON.stringify(coveredTopics);
      const taskInstruction = buildCheckpointFlashcardTask(topicTitles, progression?.learningMethod ?? undefined);

      const { parsed } = await generateStructured({
        schema: FlashcardsSchema,
        systemPreamble: SYSTEM_PREAMBLE,
        documentText: topicContent,
        taskInstruction,
        maxTokens: 1500,
      });

      const cards = parsed.cards;
      await saveCheckpointFlashcards(documentId, checkpointIndex, cards, user.id);

      if (progression) {
        const cpStatus = progression.checkpointStatuses.find(c => c.checkpointIndex === checkpointIndex);
        if (cpStatus) cpStatus.flashcardsGenerated = true;
        await upsertProgression(progression);
      }

      return NextResponse.json({ cards });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[checkpoint-flashcards] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

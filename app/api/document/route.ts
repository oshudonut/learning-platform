import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const doc = await getDocument(id, user.id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { text: _text, reviewer, quiz, flashcards, transcript, ...meta } = doc;

    return NextResponse.json({
      document: {
        ...meta,
        hasReviewer: Boolean(reviewer),
        hasQuiz: Boolean(quiz),
        hasFlashcards: Boolean(flashcards?.length),
        hasTranscript: Boolean(transcript),
        transcriptStatus: meta.transcriptStatus ?? "none",
        transcriptPageCount: transcript?.meta?.pageCount ?? 0,
        conceptCount: reviewer?.topics?.length ?? 0,
        questionCount: quiz?.questions?.length ?? 0,
        flashcardCount: flashcards?.length ?? 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

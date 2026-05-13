import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const doc = await getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { text: _text, reviewer, quiz, flashcards, ...meta } = doc;

    return NextResponse.json({
      document: {
        ...meta,
        hasReviewer: Boolean(reviewer),
        hasQuiz: Boolean(quiz),
        hasFlashcards: Boolean(flashcards?.length),
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

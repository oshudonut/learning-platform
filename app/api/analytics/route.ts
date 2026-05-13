import { NextRequest, NextResponse } from "next/server";
import {
  getAnalytics,
  recordQuizAttempt,
  recordFlashcardSession,
} from "@/lib/store";
import type { QuizAttempt, FlashcardSession } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const analytics = await getAnalytics();
    return NextResponse.json({ analytics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.type === "quiz_attempt") {
      const attempt = body.data as QuizAttempt;
      await recordQuizAttempt(attempt);
      return NextResponse.json({ success: true });
    }

    if (body.type === "flashcard_session") {
      const session = body.data as FlashcardSession;
      await recordFlashcardSession(session);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

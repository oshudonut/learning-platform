import { NextRequest, NextResponse } from "next/server";
import { saveFlashcardReviewStates, getFlashcardReviewStates } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { FlashcardReviewState } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const docId = req.nextUrl.searchParams.get("documentId");
    if (!docId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }
    const states = await getFlashcardReviewStates(docId, user.id);
    return NextResponse.json({ states });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { documentId, states } = (await req.json()) as {
      documentId: string;
      states: FlashcardReviewState[];
    };
    if (!documentId || !states) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    await saveFlashcardReviewStates(documentId, user.id, states);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

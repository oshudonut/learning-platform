import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getNotesByDocument, upsertNote, deleteNote, insertLearningEvent } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const documentId = req.nextUrl.searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "documentId query param is required" }, { status: 400 });

    const notes = await getNotesByDocument(user.id, documentId);
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("GET /api/notes:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      documentId?: unknown;
      topicIndex?: unknown;
      noteText?: unknown;
      confusionLevel?: unknown;
    };

    const documentId = typeof body.documentId === "string" ? body.documentId : null;
    const topicIndex = typeof body.topicIndex === "number" ? body.topicIndex : null;
    const noteText = typeof body.noteText === "string" ? body.noteText : null;
    const confusionLevel =
      typeof body.confusionLevel === "number" ? body.confusionLevel : undefined;

    if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    if (topicIndex === null) return NextResponse.json({ error: "topicIndex is required" }, { status: 400 });
    if (noteText === null) return NextResponse.json({ error: "noteText is required" }, { status: 400 });

    const note = await upsertNote(user.id, documentId, topicIndex, noteText, confusionLevel);

    // Analytics are non-fatal — insertLearningEvent handles its own errors
    await insertLearningEvent(user.id, documentId, "note_created", {
      topic_index: topicIndex,
      confusion_level: confusionLevel ?? null,
    });

    return NextResponse.json({ note });
  } catch (err) {
    console.error("POST /api/notes:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { documentId?: unknown; topicIndex?: unknown };
    const documentId = typeof body.documentId === "string" ? body.documentId : null;
    const topicIndex = typeof body.topicIndex === "number" ? body.topicIndex : null;

    if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    if (topicIndex === null) return NextResponse.json({ error: "topicIndex is required" }, { status: 400 });

    await deleteNote(user.id, documentId, topicIndex);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/notes:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

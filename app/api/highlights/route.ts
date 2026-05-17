import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  getHighlightsByDocument,
  createHighlight,
  deleteHighlight,
  type ReviewerHighlight,
} from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const documentId = req.nextUrl.searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

    const highlights = await getHighlightsByDocument(documentId, user.id);
    return NextResponse.json({ highlights });
  } catch (err) {
    console.error("GET /api/highlights:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      documentId?: string;
      topicIndex?: number;
      fieldName?: string;
      itemIndex?: number;
      charStart?: number;
      charEnd?: number;
      colorTag?: ReviewerHighlight["colorTag"];
    };

    const { documentId, topicIndex, fieldName, charStart, charEnd, colorTag } = body;
    const itemIndex = body.itemIndex ?? 0;

    if (!documentId || topicIndex === undefined || !fieldName || charStart === undefined || charEnd === undefined || !colorTag) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (charStart >= charEnd) {
      return NextResponse.json({ error: "charStart must be less than charEnd" }, { status: 400 });
    }

    const highlight = await createHighlight(
      user.id,
      documentId,
      topicIndex,
      fieldName,
      itemIndex,
      charStart,
      charEnd,
      colorTag,
    );
    return NextResponse.json({ highlight });
  } catch (err) {
    console.error("POST /api/highlights:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await req.json() as { id?: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await deleteHighlight(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/highlights:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

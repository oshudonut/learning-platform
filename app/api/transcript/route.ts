import { NextRequest, NextResponse } from "next/server";
import { generateTranscriptForDocument } from "@/lib/transcript";
import { getDocument } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { id?: string; force?: boolean };
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const doc = await getDocument(body.id, user.id);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const { transcript, fromCache } = await generateTranscriptForDocument(doc, { force: body.force });

    return NextResponse.json({
      transcript,
      cached: fromCache,
      pageCount: transcript.meta.pageCount,
      sourceType: transcript.meta.sourceType,
      status: fromCache ? "cached" : transcript.meta.status,
      extractionMethod: transcript.meta.extractionMethod,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcript] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabase as admin } from "@/lib/supabase";
import { claimTranscriptJob } from "@/lib/store";
import { processTranscriptJob } from "@/lib/transcript-processor";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { documentId?: string };
    const { documentId } = body;

    if (!documentId || typeof documentId !== "string") {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // Atomic claim — only one concurrent worker wins; duplicate triggers are safe
    const { claimed, storageKey } = await claimTranscriptJob(documentId, user.id);

    if (!claimed) {
      return NextResponse.json({ status: "skipped", reason: "already_processing_or_completed" });
    }

    // Claimed but no file to process — should not happen in normal flow
    if (!storageKey) {
      await admin
        .from("documents")
        .update({
          transcript_status: "failed",
          last_error: "No storage key found — file may have been deleted before processing",
          processing_completed_at: Date.now(),
        })
        .eq("id", documentId)
        .eq("user_id", user.id);

      return NextResponse.json(
        { error: "No storage key found for this document" },
        { status: 422 },
      );
    }

    const result = await processTranscriptJob(documentId, user.id, storageKey);

    return NextResponse.json({
      success: result.success,
      diagnostics: result.diagnostics,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcript/process] unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

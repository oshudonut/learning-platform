// Standalone transcript processor — callable from API route, queue worker, cron, or retry system.
// No request-bound assumptions. Full timing diagnostics included.

import { supabase } from "./supabase";
import { ocrPdfWithVision } from "./claude";
import { buildTranscriptFromExtractedPages } from "./transcript";
import { chunkText } from "./pdf";
import { saveChunks, computeContentHash } from "./store";

const BUCKET = "temp-uploads";
const TEXT_STORE_CAP = 60_000;
const OCR_TIMEOUT_MS = 240_000; // 4 min — leaves 60s buffer inside Vercel's 300s maxDuration

export type ProcessingDiagnostics = {
  documentId: string;
  totalMs: number;
  downloadMs: number;
  ocrMs: number;
  persistMs: number;
  textLength: number;
  pageCount: number;
  chunkCount: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
        ms,
      ),
    ),
  ]);
}

export async function processTranscriptJob(
  documentId: string,
  userId: string,
  storageKey: string,
): Promise<{ success: boolean; error?: string; diagnostics: Partial<ProcessingDiagnostics> }> {
  const start = Date.now();
  const diagnostics: Partial<ProcessingDiagnostics> = { documentId };

  try {
    // Step 1 — Download from storage
    const dlStart = Date.now();
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(storageKey);

    if (dlErr || !blob) {
      throw new Error(`Storage download failed: ${dlErr?.message ?? "not found"}`);
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    diagnostics.downloadMs = Date.now() - dlStart;
    console.log("[transcript-processor]", { step: "download", documentId, downloadMs: diagnostics.downloadMs, bytes: buffer.length });

    // Step 2 — OCR with timeout
    const ocrStart = Date.now();
    const text = await withTimeout(
      ocrPdfWithVision(buffer.toString("base64")),
      OCR_TIMEOUT_MS,
      "OCR",
    );
    diagnostics.ocrMs = Date.now() - ocrStart;
    diagnostics.textLength = text.length;
    console.log("[transcript-processor]", { step: "ocr", documentId, ocrMs: diagnostics.ocrMs, textLength: text.length });

    // Step 3 — Build transcript
    const transcript = buildTranscriptFromExtractedPages([text], {
      sourceType: "pdf",
      extractionMethod: "claude-ocr-per-page",
      ocrSource: true,
    });
    diagnostics.pageCount = transcript.pages.length;

    // Step 4 — Persist to DB
    const persistStart = Date.now();
    const storedText = text.length > TEXT_STORE_CAP ? text.slice(0, TEXT_STORE_CAP) : text;
    const contentHash = computeContentHash(storedText);
    const now = Date.now();

    const { error: updateErr } = await supabase
      .from("documents")
      .update({
        text: storedText,
        text_length: text.length,
        content_hash: contentHash,
        transcript,
        transcript_status: "completed",
        last_attempt_at: now,
        processing_completed_at: now,
        last_error: null,
        storage_key: null, // cleared after success
      })
      .eq("id", documentId)
      .eq("user_id", userId);

    if (updateErr) throw new Error(`DB persist failed: ${updateErr.message}`);
    diagnostics.persistMs = Date.now() - persistStart;
    console.log("[transcript-processor]", { step: "persist", documentId, persistMs: diagnostics.persistMs });

    // Step 5 — Rebuild chunks (non-fatal)
    try {
      const chunks = chunkText(text);
      diagnostics.chunkCount = chunks.length;
      await saveChunks(documentId, userId, chunks);
    } catch (chunkErr) {
      console.warn("[transcript-processor] chunk rebuild failed (non-fatal):", chunkErr);
    }

    // Step 6 — Cleanup storage (fire-and-forget)
    supabase.storage.from(BUCKET).remove([storageKey]).catch(() => null);

    diagnostics.totalMs = Date.now() - start;
    console.log("[transcript-processor]", { step: "done", documentId, ...diagnostics });

    return { success: true, diagnostics };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcript-processor] failed:", { documentId, message });

    diagnostics.totalMs = Date.now() - start;

    // Mark document as failed
    const { error: failErr } = await supabase
      .from("documents")
      .update({
        transcript_status: "failed",
        last_error: message,
        processing_completed_at: Date.now(),
      })
      .eq("id", documentId)
      .eq("user_id", userId);
    if (failErr) {
      console.error("[transcript-processor] failed to write error status:", failErr.message);
    }

    return { success: false, error: message, diagnostics };
  }
}

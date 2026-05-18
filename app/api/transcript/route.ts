import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/claude";
import { TRANSCRIPT_SYSTEM_PREAMBLE, TRANSCRIPT_TASK } from "@/lib/prompts";
import { getDocument, updateTranscript } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import { TranscriptBoundariesOutputSchema } from "@/lib/types";
import type { RawTranscript, TranscriptPage, TranscriptBoundary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Full doc.text is sent to Claude for accurate boundary detection.
// Claude output is only titles + 60-char markers — output tokens stay tiny.
const MAX_INPUT_CHARS = 60_000;

// Minimum text to warrant a Claude call; shorter docs become a single page.
const MIN_CHARS_FOR_DETECTION = 300;

type ReconstructStatus = "generated" | "fallback";

function singlePageFallback(text: string): TranscriptPage[] {
  return [{
    pageNumber: 1,
    title: "Document",
    content: text,
    sections: [],
    charCount: text.length,
    isEmpty: text.replace(/\s/g, "").length < 10,
    ocrSource: false,
  }];
}

function reconstructPages(
  text: string,
  boundaries: TranscriptBoundary[],
): { pages: TranscriptPage[]; status: ReconstructStatus } {
  // Locate each boundary in the source text, walking forward so duplicate
  // titles resolve to the correct sequential occurrence.
  const positions: Array<{ idx: number; title: string; level: number }> = [];
  let searchFrom = 0;

  for (const b of boundaries) {
    // Primary: exact title match after previous found position
    let pos = text.indexOf(b.title, searchFrom);

    // Fallback: exact startMarker match (body text after heading)
    if (pos === -1 && b.startMarker.length > 0) {
      pos = text.indexOf(b.startMarker, searchFrom);
    }

    if (pos !== -1) {
      positions.push({ idx: pos, title: b.title, level: b.level });
      searchFrom = pos + 1;
    }
    // If neither match found: skip this boundary; the section's content
    // will naturally be included in the surrounding section's slice.
  }

  if (positions.length === 0) {
    return { pages: singlePageFallback(text), status: "fallback" };
  }

  const pages: TranscriptPage[] = positions.map((pos, i) => {
    const start = pos.idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
    const content = text.slice(start, end);
    return {
      pageNumber: i + 1,
      title: pos.title,
      content,
      sections: [],
      charCount: content.length,
      isEmpty: content.replace(/\s/g, "").length < 10,
      ocrSource: false,
    };
  });

  return { pages, status: "generated" };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { id?: string; force?: boolean };
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const doc = await getDocument(body.id, user.id);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    // Return cached transcript unless force-regenerating.
    // Transcript is immutable source data — force should be rare (OCR correction, etc.)
    if (doc.transcript && !body.force) {
      return NextResponse.json({
        transcript: doc.transcript,
        cached: true,
        pageCount: doc.transcript.totalPages,
        sourceType: doc.transcript.sourceType,
        status: "cached",
      });
    }

    const text = doc.text.slice(0, MAX_INPUT_CHARS);

    // Short-circuit: tiny documents become a single page without a Claude call.
    if (text.replace(/\s/g, "").length < MIN_CHARS_FOR_DETECTION) {
      const pages = singlePageFallback(text);
      const transcript: RawTranscript = {
        sourceType: "reconstructed",
        totalPages: pages.length,
        pages,
        extractedAt: Date.now(),
      };
      await updateTranscript(body.id, user.id, transcript);
      return NextResponse.json({
        transcript,
        cached: false,
        pageCount: transcript.totalPages,
        sourceType: transcript.sourceType,
        status: "fallback",
      });
    }

    // Identify section boundaries via Claude.
    // Output is compact (titles + 60-char markers only) — maxTokens: 2000 is sufficient
    // for up to ~60 sections. The document text is cached in the system block.
    let boundaries: TranscriptBoundary[];
    try {
      const { parsed } = await generateStructured({
        schema: TranscriptBoundariesOutputSchema,
        systemPreamble: TRANSCRIPT_SYSTEM_PREAMBLE,
        documentText: text,
        taskInstruction: TRANSCRIPT_TASK,
        maxTokens: 2000,
      });
      boundaries = parsed.sections;
    } catch (claudeErr) {
      // Retry once on transient API errors before falling back to single-page.
      console.warn("[transcript] Claude call failed, retrying once:", claudeErr);
      try {
        const { parsed } = await generateStructured({
          schema: TranscriptBoundariesOutputSchema,
          systemPreamble: TRANSCRIPT_SYSTEM_PREAMBLE,
          documentText: text,
          taskInstruction: TRANSCRIPT_TASK,
          maxTokens: 2000,
        });
        boundaries = parsed.sections;
      } catch (retryErr) {
        console.error("[transcript] retry also failed, using single-page fallback:", retryErr);
        const pages = singlePageFallback(text);
        const transcript: RawTranscript = {
          sourceType: "reconstructed",
          totalPages: pages.length,
          pages,
          extractedAt: Date.now(),
        };
        await updateTranscript(body.id, user.id, transcript);
        return NextResponse.json({
          transcript,
          cached: false,
          pageCount: transcript.totalPages,
          sourceType: transcript.sourceType,
          status: "fallback",
        });
      }
    }

    // Reconstruct verbatim pages by slicing doc.text at identified boundaries.
    // Source content is never passed through Claude — only position markers are.
    const { pages, status } = reconstructPages(text, boundaries);

    const transcript: RawTranscript = {
      sourceType: "reconstructed",
      totalPages: pages.length,
      pages,
      extractedAt: Date.now(),
    };

    await updateTranscript(body.id, user.id, transcript);

    return NextResponse.json({
      transcript,
      cached: false,
      pageCount: transcript.totalPages,
      sourceType: transcript.sourceType,
      status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcript] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

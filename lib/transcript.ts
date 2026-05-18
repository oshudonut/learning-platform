// Transcript generation service — Layer 0 of the source architecture.
//
// This module is intentionally decoupled from HTTP request lifecycle so it can
// be called from the API route today and from a queue worker or cron job later
// without modification.
//
// Entry point: generateTranscriptForDocument()

import { generateStructured } from "./claude";
import { TRANSCRIPT_SYSTEM_PREAMBLE, TRANSCRIPT_TASK } from "./prompts";
import { updateTranscript } from "./store";
import { TranscriptBoundariesOutputSchema } from "./types";
import type {
  Document,
  RawTranscript,
  TranscriptPage,
  TranscriptBoundary,
  TranscriptMeta,
  TranscriptExtractionMethod,
  TranscriptStatus,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

// Full doc.text is sent for accurate boundary detection.
// Claude output is bounded (titles + 60-char markers only) regardless of input size.
const MAX_INPUT_CHARS = 60_000;

// Below this threshold no Claude call is made; entire text becomes one section.
const MIN_CHARS_FOR_DETECTION = 300;

// Schema version — increment when TranscriptPage/Section shape changes in a
// way that breaks downstream consumers (highlights, citations, flashcard links).
const TRANSCRIPT_VERSION = 1;

// Approximate Claude Sonnet pricing (USD per token).
// These are estimates; update when pricing changes. Stored value is labeled as
// estimatedCostUsd in TranscriptMeta so callers know it is not exact.
const COST_INPUT = 3e-6;        // $3 / 1M tokens (uncached input)
const COST_OUTPUT = 15e-6;      // $15 / 1M tokens
const COST_CACHE_READ = 0.3e-6; // $0.30 / 1M tokens
const COST_CACHE_WRITE = 3.75e-6; // $3.75 / 1M tokens (25% over input)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  return (
    inputTokens * COST_INPUT +
    outputTokens * COST_OUTPUT +
    cacheReadTokens * COST_CACHE_READ +
    cacheWriteTokens * COST_CACHE_WRITE
  );
}

function buildPageId(pageNumber: number): string {
  return `page_${pageNumber}`;
}

function buildSectionId(pageNumber: number, sectionIndex: number): string {
  return `page_${pageNumber}_section_${sectionIndex}`;
}

function singlePageFallback(text: string): TranscriptPage[] {
  const page: TranscriptPage = {
    id: buildPageId(1),
    pageNumber: 1,
    title: "Document",
    rawText: text,
    content: text,
    sections: [],
    charCount: text.length,
    empty: text.replace(/\s/g, "").length < 10,
    lowConfidence: false,
    malformed: false,
    ocrSource: false,
  };
  return [page];
}

function reconstructPages(
  text: string,
  boundaries: TranscriptBoundary[],
): { pages: TranscriptPage[]; method: TranscriptExtractionMethod } {
  // Walk boundaries in order, advancing the search cursor so duplicate titles
  // resolve to the correct sequential occurrence in the source text.
  const positions: Array<{ idx: number; title: string; level: number }> = [];
  let searchFrom = 0;

  for (const b of boundaries) {
    // Primary: exact title match after previous found position.
    let pos = b.title.length > 0 ? text.indexOf(b.title, searchFrom) : -1;

    // Fallback: exact startMarker match (body text immediately after heading).
    if (pos === -1 && b.startMarker.length > 0) {
      pos = text.indexOf(b.startMarker, searchFrom);
    }

    if (pos !== -1) {
      positions.push({ idx: pos, title: b.title, level: b.level });
      searchFrom = pos + 1;
    }
    // If neither match: skip — the content merges into the surrounding section.
  }

  if (positions.length === 0) {
    return { pages: singlePageFallback(text), method: "single-page" };
  }

  const pages: TranscriptPage[] = positions.map((pos, i) => {
    const start = pos.idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
    const content = text.slice(start, end);
    const pageNumber = i + 1;
    return {
      id: buildPageId(pageNumber),
      pageNumber,
      title: pos.title,
      rawText: content,      // source-verbatim slice; identical to content for reconstructed
      content,               // working content; may differ from rawText after OCR cleaning
      sections: [],          // subsections populated in later phases
      charCount: content.length,
      empty: content.replace(/\s/g, "").length < 10,
      lowConfidence: false,  // OCR confidence scoring is Phase 3+
      malformed: false,      // structural anomaly detection is Phase 3+
      ocrSource: false,
    };
  });

  return { pages, method: "claude-boundary" };
}

function buildTranscript(
  pages: TranscriptPage[],
  meta: Omit<TranscriptMeta, "version" | "pageCount" | "tokenCount" | "cached">,
  tokenBag: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
): RawTranscript {
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = tokenBag;
  const fullMeta: TranscriptMeta = {
    ...meta,
    version: TRANSCRIPT_VERSION,
    pageCount: pages.length,
    tokenCount: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    cached: cacheReadTokens > 0,
  };
  return { meta: fullMeta, pages };
}

// ─── Upload-time builder ──────────────────────────────────────────────────────
//
// buildTranscriptFromExtractedPages() is called at upload time when page text
// is already available (text PDFs via pdf-parse, images via OCR). No Claude
// call is made — the extraction method records how the pages were obtained.

export function buildTranscriptFromExtractedPages(
  pageTexts: string[],
  options: {
    sourceType?: TranscriptMeta["sourceType"];
    extractionMethod?: TranscriptExtractionMethod;
    ocrSource?: boolean;
  } = {},
): RawTranscript {
  const {
    sourceType = "pdf",
    extractionMethod = "pdfjs-per-page",
    ocrSource = false,
  } = options;

  const startTime = Date.now();
  const pages: TranscriptPage[] = pageTexts.map((pageText, i) => {
    const pageNumber = i + 1;
    return {
      id: buildPageId(pageNumber),
      pageNumber,
      title: `Page ${pageNumber}`,
      rawText: pageText,
      content: pageText,
      sections: [],
      charCount: pageText.length,
      empty: pageText.replace(/\s/g, "").length < 10,
      lowConfidence: false,
      malformed: false,
      ocrSource,
    };
  });

  return buildTranscript(
    pages,
    {
      status: "completed" as TranscriptStatus,
      sourceType,
      extractionMethod,
      generatedAt: Date.now(),
      processingTimeMs: Date.now() - startTime,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      failedReason: null,
    },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
}

// ─── Public service function ───────────────────────────────────────────────────
//
// generateTranscriptForDocument() is the single entrypoint for transcript
// generation. It handles caching, Claude calls, reconstruction, retries, and
// DB persistence. Call it from any context: HTTP route, queue worker, cron job.

export type GenerateTranscriptResult = {
  transcript: RawTranscript;
  fromCache: boolean;
};

export async function generateTranscriptForDocument(
  doc: Document,
  options: { force?: boolean } = {},
): Promise<GenerateTranscriptResult> {
  // ── Cache check ──────────────────────────────────────────────────────────────
  if (doc.transcript && !options.force) {
    return { transcript: doc.transcript, fromCache: true };
  }

  const startTime = Date.now();
  const text = doc.text.slice(0, MAX_INPUT_CHARS);

  const userId = doc.userId ?? "";

  // ── Short-circuit for trivially small documents ───────────────────────────────
  if (text.replace(/\s/g, "").length < MIN_CHARS_FOR_DETECTION) {
    const pages = singlePageFallback(text);
    const transcript = buildTranscript(
      pages,
      {
        status: "completed" as TranscriptStatus,
        sourceType: "reconstructed",
        extractionMethod: "single-page",
        generatedAt: Date.now(),
        processingTimeMs: Date.now() - startTime,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        failedReason: null,
      },
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    );
    await updateTranscript(doc.id, userId, transcript);
    return { transcript, fromCache: false };
  }

  // ── Claude boundary detection — one automatic retry on transient failure ──────
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0;
  let pages: TranscriptPage[] = [];
  let extractionMethod: TranscriptExtractionMethod = "claude-boundary";
  let status: TranscriptStatus = "completed";
  let failedReason: string | null = null;

  const callClaude = async () =>
    generateStructured({
      schema: TranscriptBoundariesOutputSchema,
      systemPreamble: TRANSCRIPT_SYSTEM_PREAMBLE,
      documentText: text,
      taskInstruction: TRANSCRIPT_TASK,
      maxTokens: 2000,
    });

  let claudeResult: Awaited<ReturnType<typeof callClaude>> | null = null;

  try {
    claudeResult = await callClaude();
  } catch (firstErr) {
    console.warn("[transcript] Claude call failed, retrying once:", firstErr);
    try {
      claudeResult = await callClaude();
    } catch (retryErr) {
      console.error("[transcript] retry failed, falling back to single-page:", retryErr);
      failedReason = retryErr instanceof Error ? retryErr.message : String(retryErr);
    }
  }

  if (claudeResult) {
    inputTokens = claudeResult.inputTokens;
    outputTokens = claudeResult.outputTokens;
    cacheReadTokens = claudeResult.cacheReadTokens;
    cacheWriteTokens = claudeResult.cacheWriteTokens;

    const result = reconstructPages(text, claudeResult.parsed.sections);
    pages = result.pages;
    extractionMethod = result.method;
  } else {
    // Both attempts failed — use single-page fallback so the user still gets content.
    pages = singlePageFallback(text);
    extractionMethod = "single-page";
    status = "completed"; // partial success — content is available even without structure
  }

  const transcript = buildTranscript(
    pages,
    {
      status,
      sourceType: "reconstructed",
      extractionMethod,
      generatedAt: Date.now(),
      processingTimeMs: Date.now() - startTime,
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens),
      failedReason,
    },
    { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
  );

  await updateTranscript(doc.id, userId, transcript);
  return { transcript, fromCache: false };
}

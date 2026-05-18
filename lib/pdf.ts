// Import the lib entry directly to avoid pdf-parse's index.js debug-mode
// behavior, which tries to read a sample PDF at import time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  buffer: Buffer,
  options?: { pagerender?: (pageData: unknown) => Promise<string> },
) => Promise<{ text: string; numpages: number }>;

import type { TextChunk } from "./types";

const MAX_CHARS = 200_000;

export async function extractPdfText(
  buffer: Buffer,
): Promise<{ text: string; pages: number; truncated: boolean }> {
  const parsed = await pdfParse(buffer);
  let text = (parsed.text ?? "").trim();
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  return { text, pages: parsed.numpages ?? 0, truncated };
}

/**
 * Extract text page-by-page using pdf-parse's pagerender hook.
 * Returns each page's raw text as a separate string in order.
 * Stops accumulating pages once totalChars exceeds MAX_CHARS so very large
 * PDFs don't blow memory; remaining pages are omitted from pageTexts but
 * numpages still reflects the true PDF page count.
 */
export async function extractPdfPages(
  buffer: Buffer,
): Promise<{ pageTexts: string[]; numpages: number; text: string; truncated: boolean }> {
  const pageTexts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData: unknown) => {
      // Once we've exceeded the char budget, return empty but keep pdfjs
      // moving through remaining pages so numpages is accurate.
      if (truncated) return "";

      const pd = pageData as { getTextContent: (opts: object) => Promise<{ items: Array<{ str: string; transform: number[] }> }> };
      const textContent = await pd.getTextContent({ normalizeWhitespace: false });

      let lastY: number | undefined;
      let text = "";
      for (const item of textContent.items) {
        if (lastY === undefined || lastY === item.transform[5]) {
          text += item.str;
        } else {
          text += "\n" + item.str;
        }
        lastY = item.transform[5];
      }

      pageTexts.push(text);
      totalChars += text.length;
      if (totalChars > MAX_CHARS) truncated = true;
      return text;
    },
  });

  const text = pageTexts.join("\n\n");
  return { pageTexts, numpages: parsed.numpages ?? pageTexts.length, text, truncated };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalise whitespace in extracted PDF text so that word-splitting is
 * reliable and chunk sizes are predictable.
 *
 * Steps:
 *  1. Collapse runs of spaces/tabs into a single space.
 *  2. Remove spaces that appear directly before or after a newline.
 *  3. Collapse three-or-more consecutive newlines into two (paragraph break).
 *  4. Trim leading/trailing whitespace from the entire string.
 */
function cleanWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")          // collapse horizontal whitespace
    .replace(/[ \t]*\n[ \t]*/g, "\n") // strip spaces around newlines
    .replace(/\n{3,}/g, "\n\n")       // normalise paragraph gaps
    .trim();
}

/**
 * Returns true when `line` looks like a Table-of-Contents entry.
 *
 * Patterns recognised:
 *  - "Chapter 3 ..... 42"  (leader dots with trailing page number)
 *  - "Introduction .... 1"
 *  - Lines that are almost entirely dots / dashes followed by digits.
 *  - Short lines (≤ 6 words) that end with a bare number.
 */
function isTocLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;

  // Leader-dot / leader-dash pattern followed by a page number.
  if (/[.\-]{3,}\s*\d+\s*$/.test(trimmed)) return true;

  // Short line whose last token is a bare integer (typical TOC entry without
  // leader dots, e.g. "Introduction 1" or "3.2  Methodology 47").
  const words = trimmed.split(/\s+/);
  if (words.length <= 6 && /^\d+$/.test(words[words.length - 1])) return true;

  return false;
}

/**
 * Returns true when `line` looks like an isolated page number.
 *
 * Patterns recognised:
 *  - A line containing only digits, optionally wrapped in dashes ("- 42 -").
 *  - "Page 5" or "5 of 120".
 *  - Lines consisting solely of Roman numerals (front-matter pagination).
 */
function isPageNumberLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;

  if (/^-?\s*\d+\s*-?$/.test(trimmed)) return true;
  if (/^(page\s+)?\d+(\s+of\s+\d+)?$/i.test(trimmed)) return true;
  // Roman numeral-only line (e.g. "iv", "XII")
  if (/^[ivxlcdmIVXLCDM]+$/.test(trimmed) && trimmed.length <= 6) return true;

  return false;
}

/**
 * Returns true when `line` looks like a References / Bibliography section
 * heading or an individual citation entry.
 *
 * Matches:
 *  - Standalone headings: "References", "Bibliography", "Works Cited", etc.
 *  - Numbered citations: "[1] Author, Title…" or "1. Author…"
 */
function isReferenceLine(line: string): boolean {
  const trimmed = line.trim();

  if (
    /^(references|bibliography|works\s+cited|further\s+reading)$/i.test(trimmed)
  )
    return true;

  if (/^\[\d+\]/.test(trimmed)) return true;
  if (/^\d+\.\s+[A-Z]/.test(trimmed)) return true;

  return false;
}

/**
 * Returns a density score in [0, 1] that reflects how educationally useful a
 * paragraph is likely to be.
 *
 * Higher scores are given to paragraphs that:
 *  - Are longer (more words, saturating at 60).
 *  - Contain several complete sentences.
 *  - Have few all-uppercase tokens (headings tend to shout).
 *  - Are not predominantly numeric (tables, indexes).
 */
function paragraphDensityScore(paragraph: string): number {
  const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 5) return 0;

  // Length factor: saturates at 60 words.
  const lengthFactor = Math.min(words.length / 60, 1);

  // Sentence-ending punctuation count; saturates at 4 sentences.
  const sentenceCount = (paragraph.match(/[.!?]/g) ?? []).length;
  const sentenceFactor = Math.min(sentenceCount / 4, 1);

  // Penalise paragraphs with many all-caps words (headings/labels).
  const capsWords = words.filter(
    (w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w),
  );
  const capsPenalty = Math.min(capsWords.length / words.length, 1) * 0.5;

  // Penalise paragraphs that are mostly numeric.
  const numericWords = words.filter((w) => /^\d+([.,]\d+)?$/.test(w));
  const numericPenalty =
    Math.min(numericWords.length / words.length, 1) * 0.5;

  return Math.max(
    0,
    lengthFactor * 0.5 + sentenceFactor * 0.5 - capsPenalty - numericPenalty,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split cleaned text into overlapping chunks of approximately `targetWords`
 * words each with `overlapWords` words of context carried over from the
 * previous chunk.
 *
 * Before splitting, excessive whitespace and redundant newlines are stripped
 * so that the word count per chunk is predictable regardless of how the PDF
 * extractor formatted the raw output.
 *
 * @param text         - Raw or pre-cleaned PDF text.
 * @param targetWords  - Approximate word count per chunk (default 800).
 * @param overlapWords - Words of overlap between consecutive chunks (default 100).
 * @returns An ordered array of {@link TextChunk} objects.
 */
export function chunkText(
  text: string,
  targetWords = 800,
  overlapWords = 100,
): TextChunk[] {
  const cleaned = cleanWhitespace(text);
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) return [];

  // Clamp overlap so it is always strictly less than the target; prevents an
  // infinite loop when the caller passes unusual values.
  const safeOverlap = Math.min(overlapWords, targetWords - 1);
  const advance = targetWords - safeOverlap;

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + targetWords, words.length);
    const slice = words.slice(start, end);
    const content = slice.join(" ");

    chunks.push({
      index: chunks.length,
      content,
      wordCount: slice.length,
    });

    if (end >= words.length) break;

    start += advance;
  }

  return chunks;
}

/**
 * Intelligently extract up to `maxChars` characters from `text` that represent
 * the most content-dense body of the document, suitable for use as an AI
 * context window.
 *
 * Algorithm:
 *  1. Strip isolated page-number lines and TOC entries line-by-line.
 *  2. Detect a References / Bibliography section and discard everything from
 *     that point onward (citations rarely help with quiz/flashcard generation).
 *  3. Re-join wrapped lines within each paragraph so the density scorer sees
 *     full prose rather than fragments.
 *  4. If the remaining text fits within `maxChars`, return it directly.
 *  5. Otherwise, use a two-pointer sliding window over density-scored
 *     paragraphs to find the contiguous run of paragraphs with the highest
 *     cumulative score that still fits within the character budget.
 *
 * @param text     - Full extracted text from the PDF.
 * @param maxChars - Maximum character budget for the returned slice (default 40 000).
 * @returns A cleaned, content-dense string ready for use as an AI context window.
 */
export function extractSummarySlice(text: string, maxChars = 40_000): string {
  // ── Step 1: line-level filtering ─────────────────────────────────────────
  const lines = text.split("\n");
  const filteredLines: string[] = [];

  for (const line of lines) {
    // Discard everything once we hit a references/bibliography heading.
    if (isReferenceLine(line)) break;
    if (isPageNumberLine(line)) continue;
    if (isTocLine(line)) continue;
    filteredLines.push(line);
  }

  // ── Step 2: paragraph-level cleaning ─────────────────────────────────────
  // Split on blank lines, then re-join soft-wrapped lines within each
  // paragraph so the density scorer sees complete sentences.
  const paragraphs = filteredLines
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]*\n[ \t]*/g, " ") // re-join wrapped lines
        .trim(),
    )
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return "";

  // ── Step 3: fast path ─────────────────────────────────────────────────────
  const fullText = paragraphs.join("\n\n");
  if (fullText.length <= maxChars) return fullText;

  // ── Step 4: sliding-window selection ─────────────────────────────────────
  // Each entry tracks the paragraph text, its density score, and its
  // character contribution including the two-character "\n\n" separator.
  const scored = paragraphs.map((p) => ({
    text: p,
    score: paragraphDensityScore(p),
    // +2 accounts for the "\n\n" separator between paragraphs; the last
    // paragraph has no trailing separator, but the slight overcount is an
    // acceptable approximation that keeps the window safely within budget.
    charLen: p.length + 2,
  }));

  let bestScore = -1;
  let bestStart = 0;
  let bestEnd = 0; // exclusive

  let windowScore = 0;
  let windowChars = 0;
  let left = 0;

  for (let right = 0; right < scored.length; right++) {
    windowScore += scored[right].score;
    windowChars += scored[right].charLen;

    // Shrink from the left while the window exceeds the character budget.
    while (windowChars > maxChars && left <= right) {
      windowScore -= scored[left].score;
      windowChars -= scored[left].charLen;
      left++;
    }

    if (windowScore > bestScore) {
      bestScore = windowScore;
      bestStart = left;
      bestEnd = right + 1;
    }
  }

  const result = scored
    .slice(bestStart, bestEnd)
    .map((s) => s.text)
    .join("\n\n");

  // Final safety clamp — should not trigger given the window logic above, but
  // guards against off-by-one errors in the charLen approximation.
  return result.length <= maxChars ? result : result.slice(0, maxChars);
}

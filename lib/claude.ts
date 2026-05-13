import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.warn("[claude] ANTHROPIC_API_KEY not set");
}

export const claude = new Anthropic({ apiKey });

export const MODEL = "claude-sonnet-4-5";
export const TUTOR_MODEL = "claude-sonnet-4-5";

type GenerateOpts<S extends z.ZodTypeAny> = {
  schema: S;
  systemPreamble: string;
  documentText: string;
  taskInstruction: string;
  maxTokens?: number;
  compressedText?: string;
};

export function compressDocumentForReview(text: string, maxChars = 4000): string {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length >= 40);

  if (!paragraphs.length) return text.slice(0, maxChars);

  const SIGNAL_WORDS = [
    "important", "key", "note", "remember", "critical", "must", "always",
    "never", "definition", "formula", "mechanism", "clinical", "diagnosis",
    "treatment", "cause", "effect",
  ];

  const scored = paragraphs.map((p) => {
    const lower = p.toLowerCase();
    let score = 0;

    if (/:\s+\S/.test(p)) score += 3;
    if (/^\s*\d+\./m.test(p)) score += 3;
    if (/\*\*[^*]+\*\*/.test(p) || /\b[A-Z]{4,}\b/.test(p)) score += 2;
    if (/[A-Za-z]+ ?= ?[A-Za-z0-9]/.test(p)) score += 2;
    score += SIGNAL_WORDS.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    if (p.length >= 80 && p.length <= 300) score += 1;

    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  let compressed = "";
  for (const { p } of scored) {
    if (compressed.length + p.length > maxChars) break;
    compressed += (compressed ? "\n\n" : "") + p;
  }

  return compressed || text.slice(0, maxChars);
}

/**
 * Structured generation with prompt caching.
 * Uses standard messages.create + JSON parsing — compatible with all models.
 * The document text block is marked ephemeral so repeated calls on the same
 * document (reviewer → quiz → flashcards) reuse the cached prefix.
 */
export async function generateStructured<S extends z.ZodTypeAny>({
  schema,
  systemPreamble,
  documentText,
  taskInstruction,
  maxTokens = 3000,
  compressedText,
}: GenerateOpts<S>): Promise<{
  parsed: z.infer<S>;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}> {
  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: [
      { type: "text", text: systemPreamble },
      {
        type: "text",
        text: `Source material:\n\n${compressedText ?? documentText}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `${taskInstruction}\n\nRespond with ONLY a valid JSON object. No markdown fences, no explanation — just the raw JSON.`,
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: z.infer<S>;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch (err) {
    throw new Error(
      `Claude returned invalid JSON or schema mismatch: ${err instanceof Error ? err.message : String(err)}\n\nRaw response (first 300 chars):\n${raw.slice(0, 300)}`,
    );
  }

  return {
    parsed,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Streaming tutor chat. Returns an async iterable of text chunks.
 * The caller is responsible for streaming to the client.
 */
export async function streamTutorResponse({
  systemPrompt,
  messages,
  maxTokens = 1500,
}: {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
}) {
  return claude.messages.stream({
    model: TUTOR_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });
}

/**
 * OCR fallback for scanned / image-only PDFs.
 *
 * Sends the raw PDF to Claude using the native document source type so the
 * model can render each page visually and return the full extracted text.
 * Capped at roughly 100 pages of output (~16 000 output tokens).
 *
 * @param pdfBase64 - The PDF file contents encoded as a base64 string.
 * @returns The extracted plain text, preserving document structure.
 * @throws If the Claude API call fails or returns no usable text.
 */
export async function ocrPdfWithVision(pdfBase64: string): Promise<string> {
  // 16 000 output tokens ≈ 100 pages of dense extracted text.
  const MAX_OUTPUT_TOKENS = 16_000;

  const content: Anthropic.Messages.ContentBlockParam[] = [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdfBase64,
      },
    },
    {
      type: "text",
      text: [
        "Extract ALL readable text from this document.",
        "Preserve the original structure: headings, paragraphs, lists, tables, and page breaks.",
        "If the document has more than 100 pages, extract only the first 100 pages.",
        "Return plain text only — no commentary, no markdown fences, no preamble.",
        "If a section is genuinely illegible, write [illegible] in its place.",
      ].join(" "),
    },
  ];

  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "user", content }],
  });

  const extracted = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!extracted) {
    throw new Error(
      "Claude OCR returned no text. The document may be blank or fully illegible.",
    );
  }

  return extracted;
}

/**
 * Extract a short chunk of relevant text from the document for tutor context.
 * Simple keyword-based retrieval — no embeddings needed for MVP.
 */
export function retrieveContext(
  documentText: string,
  query: string,
  maxChars = 3000,
): string {
  if (!documentText || !query) return "";

  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const paragraphs = documentText.split(/\n\n+/).filter((p) => p.trim().length > 50);

  if (!paragraphs.length) return documentText.slice(0, maxChars);

  // Score paragraphs by keyword overlap
  const scored = paragraphs.map((p) => {
    const lower = p.toLowerCase();
    const score = queryWords.reduce(
      (acc, w) => acc + (lower.includes(w) ? 1 : 0),
      0,
    );
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);

  let context = "";
  for (const { p } of scored) {
    if (context.length + p.length > maxChars) break;
    context += p + "\n\n";
  }

  return context.trim() || documentText.slice(0, maxChars);
}

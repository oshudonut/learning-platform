import type { SourceAnchor, RawTranscript, TranscriptPage, TranscriptSection } from "./types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AnchorConfidence =
  | "exact_section_match"   // sectionId present + section found in page
  | "fuzzy_quote_match"     // quotedText found (case-insensitive) in page/section content
  | "page_only_match"       // pageId resolved but no section/quote match
  | "unresolved";           // pageId not found in transcript

export type ResolvedAnchor = {
  pageId: string;
  sectionId?: string;
  pageNumber: number;
  title?: string;
  matchedText: string;
  confidence: AnchorConfidence;
  missing: boolean;
};

export type AnchorDiagnostics = {
  total: number;
  resolved: number;
  unresolved: number;
  confidenceDistribution: Record<AnchorConfidence, number>;
};

// ─── Module-level cache ───────────────────────────────────────────────────────
// Keyed by transcriptVersion::pageId::sectionId::quotedText

const resolverCache = new Map<string, ResolvedAnchor>();

export function clearResolverCache(): void {
  resolverCache.clear();
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // collapse runs of whitespace within lines but preserve single newlines
    .replace(/[^\S\n]+/g, " ")
    // strip common OCR artifacts: ligatures, zero-width chars, soft hyphens
    .replace(/[­​‌‍﻿]/g, "")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬀ/g, "ff")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl");
}

function snippetAround(text: string, query: string, windowChars = 200): string {
  const norm = normalizeText(text);
  const normQuery = normalizeText(query);
  const idx = norm.toLowerCase().indexOf(normQuery.toLowerCase());
  if (idx === -1) return "";
  const start = Math.max(0, idx - Math.floor(windowChars / 2));
  const end = Math.min(norm.length, idx + normQuery.length + Math.floor(windowChars / 2));
  const snippet = norm.slice(start, end);
  return (start > 0 ? "…" : "") + snippet.trim() + (end < norm.length ? "…" : "");
}

function pageSnippet(page: TranscriptPage, maxChars = 300): string {
  const text = normalizeText(page.content || page.rawText || "");
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "…";
}

// ─── Core resolver ────────────────────────────────────────────────────────────

function buildCacheKey(anchor: SourceAnchor, transcriptVersion: number): string {
  return `${transcriptVersion}::${anchor.pageId}::${anchor.sectionId ?? ""}::${anchor.quotedText ?? ""}`;
}

export function resolveAnchor(
  anchor: SourceAnchor,
  transcript: RawTranscript,
): ResolvedAnchor {
  const transcriptVersion = transcript.meta.version ?? 1;
  const cacheKey = buildCacheKey(anchor, transcriptVersion);

  const hit = resolverCache.get(cacheKey);
  if (hit) return hit;

  const result = _resolve(anchor, transcript);
  resolverCache.set(cacheKey, result);
  return result;
}

function _resolve(anchor: SourceAnchor, transcript: RawTranscript): ResolvedAnchor {
  const page = transcript.pages.find((p) => p.id === anchor.pageId);

  // Unresolved — pageId not in transcript
  if (!page) {
    return {
      pageId: anchor.pageId,
      sectionId: anchor.sectionId,
      pageNumber: -1,
      matchedText: "",
      confidence: "unresolved",
      missing: true,
    };
  }

  // Priority A — exact section match
  if (anchor.sectionId) {
    const section = page.sections?.find((s: TranscriptSection) => s.id === anchor.sectionId);
    if (section) {
      const matchedText = anchor.quotedText
        ? snippetAround(section.content, anchor.quotedText) || normalizeText(section.content).slice(0, 300)
        : normalizeText(section.content).slice(0, 300);
      return {
        pageId: anchor.pageId,
        sectionId: anchor.sectionId,
        pageNumber: page.pageNumber,
        title: section.heading || page.title,
        matchedText,
        confidence: "exact_section_match",
        missing: false,
      };
    }
  }

  // Priority B — fuzzy quote match
  if (anchor.quotedText && anchor.quotedText.trim().length > 0) {
    // Try sections first, then full page content
    const pageText = normalizeText(page.content || page.rawText || "");
    const snippet = snippetAround(pageText, anchor.quotedText);
    if (snippet) {
      // Find which section the quote lands in (best-effort)
      let matchSection: TranscriptSection | undefined;
      if (page.sections?.length) {
        matchSection = page.sections.find((s: TranscriptSection) =>
          normalizeText(s.content).toLowerCase().includes(
            normalizeText(anchor.quotedText!).toLowerCase(),
          ),
        );
      }
      return {
        pageId: anchor.pageId,
        sectionId: matchSection?.id ?? anchor.sectionId,
        pageNumber: page.pageNumber,
        title: matchSection?.heading || page.title,
        matchedText: snippet,
        confidence: "fuzzy_quote_match",
        missing: false,
      };
    }
  }

  // Priority C — page-only match
  return {
    pageId: anchor.pageId,
    sectionId: anchor.sectionId,
    pageNumber: page.pageNumber,
    title: page.title,
    matchedText: pageSnippet(page),
    confidence: "page_only_match",
    missing: false,
  };
}

// ─── Batch resolver ───────────────────────────────────────────────────────────

export function resolveAnchors(
  anchors: SourceAnchor[],
  transcript: RawTranscript,
): { resolved: ResolvedAnchor[]; diagnostics: AnchorDiagnostics } {
  const confidenceDistribution: Record<AnchorConfidence, number> = {
    exact_section_match: 0,
    fuzzy_quote_match: 0,
    page_only_match: 0,
    unresolved: 0,
  };

  const resolved = anchors.map((anchor) => {
    const r = resolveAnchor(anchor, transcript);
    confidenceDistribution[r.confidence]++;
    return r;
  });

  const unresolvedCount = confidenceDistribution.unresolved;
  const diagnostics: AnchorDiagnostics = {
    total: anchors.length,
    resolved: anchors.length - unresolvedCount,
    unresolved: unresolvedCount,
    confidenceDistribution,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[anchor-resolver]", diagnostics);
  }

  return { resolved, diagnostics };
}

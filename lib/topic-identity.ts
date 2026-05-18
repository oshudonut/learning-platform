// ─── Topic Identity System ────────────────────────────────────────────────────
//
// Produces stable, human-readable canonical IDs for review topics across
// regenerations. IDs are deterministic: same input → same output.
//
// Format:
//   canonicalTopicId:  "<slug>--<fingerprint8>"   e.g. "cryptorchidism--a3f2b1c4"
//   topicFingerprint:  "<fingerprint8>"            e.g. "a3f2b1c4"
//
// The double-dash separator allows safe splitting: id.split("--") = [slug, hash].
// Slug alone is the semantic component; fingerprint adds document/context binding.
//
// Stability contract:
//   - Same title + same document + same source anchors → same canonical ID
//   - Title variation is handled by aggressive normalization (stop word removal,
//     diacritic stripping, punctuation removal).
//   - Positional instability (topic_0, topic_1) is eliminated entirely.

import type { SourceAnchor } from "./types";

// ─── Stop words removed from slugs ───────────────────────────────────────────
// Academic/medical domain list — keeps semantic terms, removes connectives.

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for",
  "with", "by", "as", "is", "are", "was", "were", "be", "been", "being",
  "its", "it", "this", "that", "these", "those", "from", "into", "about",
  "over", "under", "between", "through", "during", "before", "after",
  "above", "below", "up", "down", "out", "off", "not", "no", "nor",
  "so", "yet", "both", "either", "neither", "each", "all", "any", "few",
  "more", "most", "other", "some", "such",
]);

// ─── FNV-1a 32-bit hash ───────────────────────────────────────────────────────
// Deterministic, no external deps. Produces consistent 8-char hex fingerprint.

function fnv1a32(str: string): number {
  let hash = 2166136261; // FNV offset basis (unsigned 32-bit)
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0; // FNV prime, keep unsigned
  }
  return hash;
}

function toHex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

// ─── normalizeTopicTitle ──────────────────────────────────────────────────────

export function normalizeTopicTitle(title: string): string {
  return title
    .toLowerCase()
    // Decompose Unicode (e.g. é → e + combining accent), then strip combining marks
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Replace hyphens/slashes/colons used as separators with spaces
    .replace(/[-–—/:;]/g, " ")
    // Strip remaining punctuation
    .replace(/[^\w\s]/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ─── generateTopicSlug ────────────────────────────────────────────────────────
//
// URL-safe kebab-case slug. Two passes of normalization:
//   Pass 1 — structural: strip subtitle patterns before they become noise
//     • Remove parentheticals: "Cryptorchidism (Undescended Testis)" → "Cryptorchidism"
//     • Take primary clause before ": " or " - ": "Endometriosis: Pathogenesis…" → "Endometriosis"
//   Pass 2 — lexical: lowercase, diacritics, stop words, truncation

export function generateTopicSlug(title: string): string {
  // Pass 1: structural normalization
  let primary = title
    // Strip parenthetical annotations: "X (Y)" → "X"
    .replace(/\s*\([^)]*\)/g, "")
    // Take clause before ": " (subtitle separator)
    .split(/:\s+/)[0]
    // Take clause before " — " or " - " (em/en dash subtitle)
    .split(/\s+[–—-]\s+/)[0]
    .trim();

  // If structural stripping left us with nothing, fall back to full title
  if (primary.length < 3) primary = title;

  // Pass 2: lexical normalization
  const normalized = normalizeTopicTitle(primary);
  const words = normalized.split(" ").filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  // Fall back to full word list if stop-word removal leaves nothing meaningful
  const tokens = words.length > 0 ? words : normalized.split(" ").filter(Boolean);

  // Truncate to 60 chars at word boundary
  let slug = "";
  for (const token of tokens) {
    const candidate = slug ? `${slug}-${token}` : token;
    if (candidate.length > 60) break;
    slug = candidate;
  }

  return slug || "topic"; // final safety fallback
}

// ─── generateTopicFingerprint ─────────────────────────────────────────────────
//
// Fingerprint context (all optional, improves stability with transcript):
//   - slug (always included)
//   - documentId (scopes ID to document)
//   - pageIds from sourceAnchors (transcript-grounded — most stable signal)
//   - nearbyTitles (adjacent topics in same generation — disambiguates duplicates)
//   - coreIdea prefix (semantic grounding when anchors absent)

export type FingerprintContext = {
  documentId?: string;
  sourceAnchors?: SourceAnchor[];
  nearbyTitles?: string[];       // adjacent topic titles in generation batch
  coreIdeaPrefix?: string;       // first ~40 chars of coreIdea/simplifiedExplanation
};

export function generateTopicFingerprint(
  slug: string,
  ctx: FingerprintContext = {},
): string {
  // Build a stable canonical string from all available context.
  // Sort where order doesn't matter (pageIds, nearbyTitles) so fingerprint is
  // independent of generation order.
  const parts: string[] = [slug];

  if (ctx.documentId) parts.push(`doc:${ctx.documentId}`);

  if (ctx.sourceAnchors && ctx.sourceAnchors.length > 0) {
    const pageIds = [...new Set(ctx.sourceAnchors.map((a) => a.pageId))].sort();
    parts.push(`pages:${pageIds.join(",")}`);
  }

  if (ctx.nearbyTitles && ctx.nearbyTitles.length > 0) {
    // Sort and normalize nearby titles before hashing
    const nearby = ctx.nearbyTitles.map(normalizeTopicTitle).sort().slice(0, 3);
    parts.push(`near:${nearby.join("|")}`);
  }

  if (ctx.coreIdeaPrefix) {
    parts.push(`idea:${normalizeTopicTitle(ctx.coreIdeaPrefix).slice(0, 40)}`);
  }

  return toHex8(fnv1a32(parts.join(";")));
}

// ─── resolveTopicId ───────────────────────────────────────────────────────────
// Convenience wrapper: returns both the canonical ID and raw fingerprint.

export type ResolvedTopicIdentity = {
  canonicalTopicId: string;  // "<slug>--<fingerprint8>"
  topicFingerprint: string;  // "<fingerprint8>"
  slug: string;
};

export function resolveTopicId(
  title: string,
  ctx: FingerprintContext = {},
): ResolvedTopicIdentity {
  const slug = generateTopicSlug(title);
  const fingerprint = generateTopicFingerprint(slug, ctx);
  return {
    canonicalTopicId: `${slug}--${fingerprint}`,
    topicFingerprint: fingerprint,
    slug,
  };
}

// ─── Topic shape expected by injectTopicIdentity ──────────────────────────────

type TopicWithTitle = {
  title: string;
  sourceAnchors?: SourceAnchor[];
  coreIdea?: string;             // standard, memory reviewer
  simplifiedExplanation?: string; // conceptual reviewer
  blurtPrompt?: string;          // retrieval reviewer
  centralConcept?: string;       // relational reviewer
  canonicalTopicId?: string;
  topicFingerprint?: string;
};

type DrillSetWithTopic = {
  topic: string;                 // rapid recall — string, not object
  canonicalTopicId?: string;
  topicFingerprint?: string;
};

// ─── injectTopicIdentity ──────────────────────────────────────────────────────
//
// Post-processing step: adds canonicalTopicId + topicFingerprint to every topic
// in a parsed transformation output. Called after Zod validation, before DB save.
// Returns a shallow copy — does NOT mutate the input.
//
// Handles all reviewer families and rapid recall.
// For Quiz / Flashcards content: pass-through unchanged (handled separately).

export function injectTopicIdentity<T extends object>(
  content: T,
  documentId: string,
): T {
  // Reviewer families: content has .topics[] with .title
  if ("topics" in content && Array.isArray((content as Record<string, unknown>).topics)) {
    const topics = (content as { topics: TopicWithTitle[] }).topics;
    const allTitles = topics.map((t) => t.title);

    const enrichedTopics = topics.map((topic, idx) => {
      // Use adjacent topic titles (±2) as context for disambiguation
      const nearbyTitles = [
        allTitles[idx - 2],
        allTitles[idx - 1],
        allTitles[idx + 1],
        allTitles[idx + 2],
      ].filter(Boolean) as string[];

      const coreIdeaPrefix =
        topic.coreIdea ??
        topic.simplifiedExplanation ??
        topic.blurtPrompt ??
        topic.centralConcept ??
        "";

      const identity = resolveTopicId(topic.title, {
        documentId,
        sourceAnchors: topic.sourceAnchors,
        nearbyTitles,
        coreIdeaPrefix: coreIdeaPrefix.slice(0, 40),
      });

      return { ...topic, ...identity };
    });

    return { ...content, topics: enrichedTopics };
  }

  // Rapid recall: content has .drillSets[] with .topic (string field)
  if ("drillSets" in content && Array.isArray((content as Record<string, unknown>).drillSets)) {
    const drillSets = (content as { drillSets: DrillSetWithTopic[] }).drillSets;
    const allTitles = drillSets.map((d) => d.topic);

    const enrichedDrillSets = drillSets.map((ds, idx) => {
      const nearbyTitles = [
        allTitles[idx - 1],
        allTitles[idx + 1],
      ].filter(Boolean) as string[];

      const identity = resolveTopicId(ds.topic, {
        documentId,
        nearbyTitles,
      });

      return { ...ds, ...identity };
    });

    return { ...content, drillSets: enrichedDrillSets };
  }

  // Quiz, Flashcards, or unknown shape — pass through unchanged
  return content;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

const _diag = {
  slugCollisions: 0,
  fingerprintCollisions: 0, // identical canonical ID for different topics (true dup)
  fallbackUsage: 0,         // "topic" fallback slug invoked
  totalGenerated: 0,
};

export function recordIdentityDiag(slug: string, isCollision: boolean, isFingerprintCollision: boolean): void {
  if (process.env.NODE_ENV === "production") return;
  _diag.totalGenerated++;
  if (isCollision) _diag.slugCollisions++;
  if (isFingerprintCollision) _diag.fingerprintCollisions++;
  if (slug === "topic") _diag.fallbackUsage++;
}

export function getIdentityDiagnostics() {
  return { ..._diag };
}

// ─── Batch collision detection (dev diagnostics) ─────────────────────────────

export function detectSlugCollisions(titles: string[]): {
  slug: string;
  count: number;
  titles: string[];
}[] {
  if (process.env.NODE_ENV === "production") return [];

  const map = new Map<string, string[]>();
  for (const title of titles) {
    const slug = generateTopicSlug(title);
    const existing = map.get(slug) ?? [];
    existing.push(title);
    map.set(slug, existing);
  }

  return [...map.entries()]
    .filter(([, t]) => t.length > 1)
    .map(([slug, t]) => ({ slug, count: t.length, titles: t }));
}

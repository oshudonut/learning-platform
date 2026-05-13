# Reviewer Refactor Spec
**Date:** 2026-05-13
**Authored by:** master-architect-orchestrator

---

## 1. Context & Verified Problems

From reading the source files directly:

- `route.ts` passes `doc.text` (full document, uncapped) to `generateStructured()` on every `force` call — no compression, no deduplication beyond presence check
- `generateStructured()` defaults to `maxTokens: 8000` and `route.ts` explicitly passes `8000` — this is the output ceiling
- `REVIEWER_TASK` instructs `sections[].content` to be "2-4 paragraphs of lecture-style explanation" — that is the single largest driver of verbose output
- `SYSTEM_PREAMBLE` is 8 lines of pedagogical prose that adds persona-building tokens with no structural benefit for a JSON-output task
- `ReviewerSchema` has `keyConcepts` (5-10 objects with explanation strings) and `sections` (3-7 objects each with a multi-paragraph `content` string) — these are the verbose output fields
- `retrieveContext()` exists in `claude.ts` and does keyword-scored paragraph retrieval, but is NEVER called in the reviewer flow — full text always goes to Claude
- No `contentHash` on the `Document` type — no way to detect re-upload of the same file

---

## 2. New Zod Schemas

These are the exact schemas for `reviewer-generator` to paste into `lib/types.ts`, replacing `KeyConceptSchema`, `SectionSchema`, and `ReviewerSchema`. `MnemonicSchema` is retained unchanged.

```typescript
// ─── Reviewer (Board-Exam Optimized) ──────────────────────────────────────────

export const ConfusedWithSchema = z.object({
  item: z.string(),
  distinction: z.string(),
});

export const ReviewerTopicSchema = z.object({
  title: z.string(),
  coreIdea: z.string(),
  keyPoints: z.array(z.string()),
  quickBreakdown: z.array(z.string()),
  mustMemorize: z.array(z.string()),
  confusedWith: z.array(ConfusedWithSchema).optional(),
  boardTips: z.array(z.string()),
  quickRecall: z.array(z.string()),
});

export const MnemonicSchema = z.object({
  concept: z.string(),
  aid: z.string(),
});

export const ReviewerSchema = z.object({
  title: z.string(),
  summary: z.string(),
  topics: z.array(ReviewerTopicSchema).min(3).max(6),
  globalMustMemorize: z.array(z.string()),
  mnemonics: z.array(MnemonicSchema),
});

export type ReviewerTopic = z.infer<typeof ReviewerTopicSchema>;
export type Reviewer = z.infer<typeof ReviewerSchema>;
```

**Remove entirely:** `KeyConceptSchema`, `SectionSchema` and all their exports/types.

**Keep untouched:** `QuizQuestionSchema`, `QuizSchema`, `FlashcardSchema`, `FlashcardsSchema`, `FlashcardReviewState`, `TutorMessage`, `Conversation`, `QuizAttempt`, `FlashcardSession`, `Analytics`, `TextChunk`.

**Document type addition (backend-db-architect's only change to types.ts):**

```typescript
export type Document = {
  id: string;
  title: string;
  filename: string;
  text: string;
  textLength: number;
  contentHash?: string;   // <-- add this field only
  createdAt: number;
  reviewer?: Reviewer;
  quiz?: Quiz;
  flashcards?: Flashcard[];
  flashcardReviewStates?: FlashcardReviewState[];
  chunks?: TextChunk[];
};
```

**Conflict coordination:** `reviewer-generator` rewrites all schema types above the `Document` interface. `backend-db-architect` adds only the `contentHash?: string` field to the `Document` interface at the bottom. These are non-overlapping edits. Run `reviewer-generator` first, then `backend-db-architect` reads the already-updated file and adds the single field.

---

## 3. New SYSTEM_PREAMBLE

Replace the existing 8-line persona block with this trimmed version. Purpose: retain JSON-output discipline, drop the verbose pedagogical persona that bloats input tokens.

```typescript
export const SYSTEM_PREAMBLE = `You are a precise medical and academic exam preparation engine. You extract high-yield, board-exam-critical information and output it in compact structured JSON.

Rules you never break:
- Output ONLY valid JSON. No markdown fences, no explanation, no preamble.
- Bullets are short phrases, not sentences. No prose in array fields.
- Prioritize what appears on exams: definitions, mechanisms, comparisons, formulas, clinical pearls.`;
```

---

## 4. New REVIEWER_TASK Prompt

Full, final, ready to paste into `lib/prompts.ts`. Replace the existing `REVIEWER_TASK` export entirely.

```typescript
export const REVIEWER_TASK = `Analyze the source material and produce a board-exam-optimized reviewer.

Return a JSON object with EXACTLY this structure:

{
  "title": "concise topic title",
  "summary": "1-2 sentences MAX — what this document is about",
  "topics": [
    {
      "title": "topic name",
      "coreIdea": "ONE sentence — the single most important idea",
      "keyPoints": ["short phrase", "short phrase", "short phrase"],
      "quickBreakdown": ["simplified bullet 1", "simplified bullet 2"],
      "mustMemorize": ["formula or definition or high-yield fact"],
      "confusedWith": [
        { "item": "commonly confused concept", "distinction": "key difference in one phrase" }
      ],
      "boardTips": ["likely exam trap or shortcut"],
      "quickRecall": ["Active recall question?"]
    }
  ],
  "globalMustMemorize": ["cross-topic high-yield fact"],
  "mnemonics": [
    { "concept": "what this helps remember", "aid": "the actual mnemonic" }
  ]
}

Hard constraints:
- topics: 3–6 items covering the most testable content
- coreIdea: exactly ONE sentence, no exceptions
- keyPoints: 3–6 short phrases — NO full sentences, NO prose
- quickBreakdown: 2–4 bullets max
- mustMemorize: high-yield only — formulas, definitions, thresholds
- confusedWith: optional — only include when genuine confusion risk exists
- boardTips: 1–3 per topic — exam traps, shortcuts, distinguishing features
- quickRecall: 1–3 active recall prompts per topic (questions, not statements)
- globalMustMemorize: 5–8 cross-topic facts
- mnemonics: 2–4 only, for genuinely hard-to-remember items
- summary: 1–2 sentences ONLY — no paragraph

Use exactly these field names. camelCase throughout. No extras.`;
```

---

## 5. compressDocumentForReview — Function Spec for rag-ai-architect

**File:** `lib/claude.ts`

**Function signature:**

```typescript
export function compressDocumentForReview(text: string, maxChars = 4000): string
```

**Logic (implement in this order):**

1. Split input text on double newlines (`/\n\n+/`) to get paragraphs. Filter to paragraphs with `>= 40` characters.
2. Score each paragraph for educational signal using this weighted rule set:
   - +3 if paragraph contains a colon followed by text (definition pattern: `term: explanation`)
   - +3 if paragraph contains a numbered list marker at the start of a line (`/^\s*\d+\./m`)
   - +2 if paragraph contains bold-style markers (`**text**` or all-caps words >= 4 chars)
   - +2 if paragraph contains a formula or equals-sign expression (`/[A-Za-z]+ ?= ?[A-Za-z0-9]/`)
   - +1 per occurrence of any of these signal words (case-insensitive): `["important", "key", "note", "remember", "critical", "must", "always", "never", "definition", "formula", "mechanism", "clinical", "diagnosis", "treatment", "cause", "effect"]`
   - +1 if paragraph length is between 80–300 chars (penalizes both too-short fragments and wall-of-text prose)
3. Sort paragraphs by score descending.
4. Greedily append paragraphs (highest score first) until total length reaches `maxChars`. Stop before exceeding the limit.
5. Return the accumulated string joined by `\n\n`.

**Fallback:** if no paragraphs score above 0, return `text.slice(0, maxChars)`.

**Also update `generateStructured()`:**

Add an optional `compressedText?: string` field to `GenerateOpts`. When provided, use `compressedText` as the content of the cached system block instead of `documentText`. The `documentText` field remains required for backward compatibility (quiz and flashcard routes still pass full text and benefit from ephemeral caching). Default `maxTokens` changes from `8000` to `3000`.

```typescript
type GenerateOpts<S extends z.ZodTypeAny> = {
  schema: S;
  systemPreamble: string;
  documentText: string;
  taskInstruction: string;
  maxTokens?: number;
  compressedText?: string;  // <-- new optional field
};
```

Inside `generateStructured`, the system array second block becomes:

```typescript
{
  type: "text",
  text: `Source material:\n\n${opts.compressedText ?? opts.documentText}`,
  cache_control: { type: "ephemeral" },
}
```

Default `maxTokens` in the function signature: change `= 8000` to `= 3000`.

---

## 6. contentHash Strategy — Spec for backend-db-architect

**File:** `lib/store.ts`

### computeContentHash

```typescript
import crypto from "crypto";

export function computeContentHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}
```

- Uses Node.js built-in `crypto` — no new dependencies
- 12 hex chars = 48 bits of collision resistance — sufficient for a single-user file store
- Import `crypto` at the top of `store.ts` alongside the existing `fs` and `path` imports

### getDocumentByContentHash

```typescript
export async function getDocumentByContentHash(hash: string): Promise<Document | null> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  for (const f of files) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), "utf8");
      const doc = JSON.parse(raw) as Document;
      if (doc.contentHash === hash) return doc;
    } catch {
      continue;
    }
  }
  return null;
}
```

- Linear scan is acceptable: single-user local store with at most dozens of documents
- Returns the first matching document — hash collisions across 12 hex chars are astronomically unlikely in this context

---

## 7. Updated route.ts — Pseudocode Flow for backend-db-architect

**File:** `app/api/reviewer/route.ts`

The full rewritten POST handler logic:

```
POST /api/reviewer

1. Parse { id, force } from request body. Return 400 if id missing.

2. Fetch doc = getDocument(id). Return 404 if not found.

3. If doc.reviewer exists AND force is falsy:
   → Return { reviewer: doc.reviewer, cached: true, cacheSource: "stored" }

4. Compute incomingHash = computeContentHash(doc.text)

5. If force is falsy AND doc.contentHash === incomingHash AND doc.reviewer exists:
   → Return { reviewer: doc.reviewer, cached: true, cacheSource: "hash" }
   (This handles the case where doc.reviewer was cleared but hash matches another doc)

6. compressed = compressDocumentForReview(doc.text)
   (imported from lib/claude.ts)

7. Call generateStructured({
     schema: ReviewerSchema,
     systemPreamble: SYSTEM_PREAMBLE,
     documentText: doc.text,
     compressedText: compressed,
     taskInstruction: REVIEWER_TASK,
     maxTokens: 3000,
   })

8. Persist: updateDocument(id, {
     reviewer: parsed,
     contentHash: incomingHash,
   })

9. Return { reviewer: parsed, cached: false, usage: { cacheReadTokens, cacheWriteTokens } }

Error handling: catch all errors, log with [reviewer] prefix, return 500 with message.
```

**Imports needed:**
```typescript
import { generateStructured, compressDocumentForReview } from "@/lib/claude";
import { REVIEWER_TASK, SYSTEM_PREAMBLE } from "@/lib/prompts";
import { getDocument, updateDocument, computeContentHash } from "@/lib/store";
import { ReviewerSchema } from "@/lib/types";
```

---

## 8. ReviewerView.tsx Rebuild Brief for reviewer-generator

**File:** `components/reviewer/ReviewerView.tsx`

Remove all rendering of: `keyConcepts` grid, `sections` accordion, `Section` component, `importanceVariant` map.

Replace with a per-topic card layout. For each topic in `reviewer.topics`, render a card containing:

1. **Topic header** — `topic.title` (prominent) + `topic.coreIdea` (muted, one-line subtitle)
2. **Key Points** — bulleted list, `topic.keyPoints`
3. **Quick Breakdown** — smaller bulleted list, `topic.quickBreakdown`
4. **Must Memorize** — amber-accented numbered list, `topic.mustMemorize`
5. **Confused With** — conditional (only if `topic.confusedWith?.length`): compact two-column comparison rows showing `item` vs `distinction`
6. **Board Tips** — distinct visual treatment (e.g. border-left accent), `topic.boardTips`
7. **Quick Recall** — interactive or styled as question prompts, `topic.quickRecall`

Top-level layout (outside topic cards):
- Summary banner (same pattern as current primary/5 banner)
- Topic cards (3–6 cards in a vertical stack or grid)
- Global Must Memorize section (amber border, same style as current mustMemorize block)
- Mnemonics section (same grid pattern as current, conditional on length > 0)

Keep all existing Tailwind classes, animation patterns (framer-motion), and icon imports that remain applicable. You may add icons from the existing lucide-react imports. Do not add new npm dependencies.

The `Reviewer` type import changes shape — the new `Reviewer` type from `lib/types.ts` will have `topics`, `globalMustMemorize`, `summary`, `title`, `mnemonics`. Update the import and all type references accordingly.

---

## 9. File Ownership Table

| File | Owner Agent | Nature of Change |
|---|---|---|
| `lib/types.ts` | reviewer-generator (primary) | Replaces ReviewerSchema + sub-schemas, removes KeyConceptSchema + SectionSchema |
| `lib/types.ts` | backend-db-architect (additive) | Adds `contentHash?: string` to Document interface ONLY — runs after reviewer-generator |
| `lib/prompts.ts` | reviewer-generator | Rewrites SYSTEM_PREAMBLE and REVIEWER_TASK; leaves QUIZ_TASK, FLASHCARD_TASK, TUTOR_SYSTEM untouched |
| `components/reviewer/ReviewerView.tsx` | reviewer-generator | Full rebuild of component to render topic-based schema |
| `lib/claude.ts` | rag-ai-architect | Adds compressDocumentForReview(), adds compressedText param to generateStructured(), changes default maxTokens to 3000 |
| `lib/store.ts` | backend-db-architect | Adds computeContentHash(), adds getDocumentByContentHash() |
| `app/api/reviewer/route.ts` | backend-db-architect | Full rewrite of POST handler |

**No agent writes to a file owned by another agent. Sequencing enforces this.**

---

## 10. Execution Sequence

```
Step 1 — reviewer-generator
  Writes: lib/types.ts (schema section), lib/prompts.ts, components/reviewer/ReviewerView.tsx
  Depends on: nothing (first mover)
  Produces: updated Reviewer type shape that downstream agents read

Step 2 — rag-ai-architect
  Writes: lib/claude.ts
  Depends on: Step 1 complete (reads updated types.ts for Reviewer type if needed)
  Produces: compressDocumentForReview() available for import

Step 3 — backend-db-architect
  Writes: lib/store.ts, app/api/reviewer/route.ts, lib/types.ts (contentHash field only)
  Depends on: Steps 1 and 2 complete
  Produces: working end-to-end reviewer generation with hash caching and compression
```

---

## 11. Token Reduction Estimates

| Source of Reduction | Mechanism | Estimated Saving |
|---|---|---|
| Input compression | compressDocumentForReview caps input at ~4000 chars vs full doc (often 15,000–40,000 chars) | 60–85% input token reduction per call |
| Trimmed SYSTEM_PREAMBLE | From ~120 tokens to ~55 tokens | ~65 input tokens saved per call |
| Removed keyConcepts output | 5–10 objects × ~40 tokens each = 200–400 output tokens eliminated | 200–400 output tokens per call |
| Removed sections.content | 3–7 sections × ~200 tokens prose each = 600–1400 output tokens eliminated | 600–1400 output tokens per call |
| maxTokens ceiling | 8000 → 3000 ceiling | Eliminates runaway verbose completions |
| Hash cache | Identical re-uploads skip Claude entirely | 100% savings on duplicate content |

**Conservative total estimate:** a typical reviewer generation drops from ~12,000–18,000 combined tokens to ~3,500–5,000 combined tokens — a **65–75% reduction** per unique generation, plus full elimination on duplicate uploads.

---

## 12. Validation Checklist (for each agent after implementation)

- [ ] `ReviewerSchema.parse(output)` succeeds on sample Claude response
- [ ] `computeContentHash("test")` returns a 12-char hex string
- [ ] `compressDocumentForReview(longText)` returns <= 4000 chars
- [ ] `generateStructured()` with `compressedText` sends compressed content in the ephemeral block
- [ ] `route.ts` returns `cached: true, cacheSource: "hash"` on second POST with same document
- [ ] `ReviewerView` renders without TypeScript errors against the new `Reviewer` type
- [ ] Quiz and flashcard routes are unaffected (they do not use `compressedText`)

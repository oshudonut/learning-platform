# Recommended Next Phase Plan

Sequenced 2-3 week plan bridging from "current prototype" to "Thesis Intelligence ready." Assumes all 10 immediate fixes from `immediate-fixes.md` are complete.

---

## Phase 1: Security and Data Integrity (Days 1-3)

**Goal**: Close all cross-user data leak paths and fix the two most dangerous data integrity holes. Unblocks: safe multi-user use, any future marketing or sharing of the platform.

### Tasks

**P1-A: Add `user_id` to `checkpoint_flashcards` and `remediation_reviewers` tables**
Write and run a new migration:
```sql
ALTER TABLE checkpoint_flashcards ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE remediation_reviewers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS checkpoint_flashcards_user_id_idx ON checkpoint_flashcards(user_id);
CREATE INDEX IF NOT EXISTS remediation_reviewers_user_id_idx ON remediation_reviewers(user_id);
```
Then update `saveCheckpointFlashcards`, `getCheckpointFlashcards`, `saveRemediationReviewer`, and `getLatestRemediationReviewer` in `lib/store.ts` to accept and filter by `userId`.

**P1-B: Fix `upsertProgression` race condition (C3)**
Replace the full-row read-modify-write pattern with a Postgres-level partial update using `jsonb_set()` for the most mutation-heavy fields. At minimum, add an `updated_at` optimistic lock:
```ts
// In upsertProgression, add to the upsert:
updated_at: Date.now(),
// On conflict, only apply if our updated_at > existing:
// Use onConflict with a WHERE clause or a Postgres function
```
Full fix: Use a Supabase RPC function that accepts the field to update and uses `jsonb_set()` atomically.

**P1-C: Fix remediation gate bypass (H8)**
Add a `readAt` timestamp to remediation reviewer completion. In `complete_remediation` action: verify that at least X seconds have elapsed since the remediation reviewer was generated before allowing quiz re-unlock. Simple version: check `remediationActive === true` AND `remediationCompletedAt IS NULL` — require both for the `complete_remediation` action to succeed. More robust: require the client to pass a section-read timestamp and validate it server-side.

**P1-D: Commit all uncommitted work from Session 2**
The HANDOFF.md notes all Session 2 changes (methodology integration, `rebuildSectionStatuses` fix, `lib/learning-methods.ts`) are uncommitted. Commit this work first before any Phase 1 changes to avoid merge conflicts.

**What this unblocks**: Cross-user isolation is complete. The platform is safe for more than one user. Educational integrity gates cannot be bypassed.

---

## Phase 2: Educational Integrity and Content Coherence (Days 4-8)

**Goal**: Make the reviewer → quiz pipeline coherent. Create `reviewer_topics` table. Fix checkpoint gating. This unblocks meaningful learning progression and prepares the foundation for thesis-scale multi-chapter reviewers.

### Tasks

**P2-A: Create `reviewer_topics` table (DB-5)**
```sql
CREATE TABLE reviewer_topics (
  id bigserial primary key,
  document_id text not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  topic_index integer not null,
  title text not null,
  schema_type text not null default 'standard',
  generated_at bigint not null,
  UNIQUE(document_id, topic_index)
);
CREATE INDEX reviewer_topics_document_id_idx ON reviewer_topics(document_id);
```
After reviewer generation succeeds, write each topic title and index to this table. This becomes the authoritative topic list.

**P2-B: Wire quiz generation to `reviewer_topics` (AI-1)**
Update `app/api/quiz/route.ts` to:
1. Read `reviewer_topics` for the document.
2. If topics exist, add "Cover ONLY these topics: [list]" as a hard constraint in `buildQuizTask`.
3. This ensures quiz questions align with what the student actually reviewed, not whatever Claude decided to cover from the raw text.

**P2-C: Fix checkpoint skip bypass (C2, DB-6)**
Add a `flashcard_review_events` table or a simpler server-side check: the `complete_checkpoint` action should verify that `checkpoint_flashcards` exist for this checkpoint (i.e., `getCheckpointFlashcards(documentId, checkpointIndex)` returns non-null). If cards were never generated, the checkpoint cannot be completed. This enforces that the student at least saw the flashcard challenge screen before proceeding.

**P2-D: Fix `updateDocument` to use direct `.update()`**
Replace the read-then-write in `lib/store.ts updateDocument()` with a direct `.update(patch).eq("id", id).eq("user_id", userId)`. This removes one DB round-trip per AI generation completion and eliminates the concurrent-write risk for document fields.

**What this unblocks**: Quiz content is now coherent with the reviewer. Checkpoint gating is meaningful. DB writes are more efficient.

---

## Phase 3: AI Efficiency and Cost Reduction (Days 9-12)

**Goal**: Implement the three cost fixes (AI-2, H4, AI-4) that together reduce monthly AI spend by ~37%. This phase is critical before scaling to more users or enabling thesis documents (which multiply per-user costs significantly).

### Tasks

**P3-A: Unified document context function (AI-2)**
Create `lib/context.ts` with:
```ts
export function getContextForGeneration(text: string, maxChars = 40_000): string {
  return extractSummarySlice(text, maxChars);
}
```
Wire this into `quiz/route.ts` and `flashcards/route.ts` to replace the raw `doc.text`. This is already partially implemented via `extractSummarySlice` in `lib/pdf.ts`.

**P3-B: Haiku model for grading and image OCR (AI-4)**
Add `HAIKU_MODEL` constant to `lib/claude.ts`. Update `generateStructured` to accept an optional `model` override. Pass `HAIKU_MODEL` from:
- `app/api/quiz/grade-open/route.ts`
- `app/api/upload/route.ts` `ocrImageWithVision()` (replace hardcoded `claude-opus-4-5`)

**P3-C: Cache tutor system prompt (H4)**
Update `streamTutorResponse` in `lib/claude.ts` to pass the system prompt as a content block array with `cache_control: { type: "ephemeral" }`. Update the type signature accordingly. The tutor route already builds the full system string — no change needed there.

**P3-D: Add token usage structured logging**
For every `generateStructured` call, log `{ docId, userId, cacheReadTokens, cacheWriteTokens, cached: cacheReadTokens > 0 }`. This makes cost visibility possible without external tooling.

**What this unblocks**: Cost is brought under control before thesis processing (which multiplies document sizes). The token logging makes future cost optimization data-driven.

---

## Phase 4: Thesis Foundation (Days 13-18)

**Goal**: Make the platform capable of ingesting and meaningfully processing a 50-150 page thesis. Covers the critical items from `thesis-readiness-evaluation.md`.

### Tasks

**P4-A: Raise text extraction and storage caps**
- `lib/pdf.ts`: Raise `MAX_CHARS` from 200,000 to 500,000 (cover full 150-page thesis).
- `app/api/upload/route.ts`: Raise `TEXT_STORE_CAP` from 60,000 to 200,000 characters. This stores the first 200K chars in `doc.text` for compatibility, while full text is available via chunks.
- Evaluate: should `doc.text` be used as a "summary slice" rather than a raw truncation? Use `extractSummarySlice(text, 200_000)` to ensure stored text is the most content-dense portion of the thesis.

**P4-B: Wire tutor RAG to chunks instead of `doc.text`**
Update `app/api/tutor/route.ts`:
1. Load `doc.chunks` (add `getChunks(documentId, userId)` call — this already exists in `lib/store.ts`).
2. Replace `retrieveContext(doc.text, message, 3000)` with a chunk-based scorer:
   ```ts
   import { retrieveContextFromChunks } from "@/lib/context";
   const context = retrieveContextFromChunks(doc.chunks, message, 3000);
   ```
3. Implement `retrieveContextFromChunks` in `lib/context.ts` using the same keyword-scoring algorithm but operating on `TextChunk[]` objects. Select the top 3-5 scoring chunks and concatenate their content.

**P4-C: Multi-section reviewer generation for long documents**
The current reviewer generates from a 4K-char compressed window — completely inadequate for a thesis. For thesis-scale documents (textLength > 50,000), switch to a chapter-aware approach:
1. Divide chunks into groups representing thesis chapters (by detecting chapter headings in chunk content).
2. Generate a mini-reviewer per group.
3. Merge the mini-reviewers into a combined structure.

This is a non-trivial AI orchestration task (multiple sequential Claude calls) — estimate L effort. Consider as a thesis-specific path rather than modifying the core reviewer route.

**P4-D: Move chunks to a dedicated table (optional for phase 4)**
Create `document_chunks` table with individual rows per chunk. This enables:
- Selective chunk loading (tutor loads only top-scored chunks, not all 50)
- Future embedding-based retrieval without loading full chunk arrays
- Proper indexing by document_id

This is the correct long-term architecture but is non-trivial to migrate. It can be deferred to Phase 5 if needed.

**What this unblocks**: The platform can meaningfully process and tutor on a full thesis. Reviewer, quiz, and flashcard generation produce content covering the full document scope. The thesis intelligence feature becomes viable.

---

## Phase Summary

| Phase | Days | Outcome |
|---|---|---|
| 1: Security + Integrity | 1-3 | Cross-user isolation complete; race conditions reduced |
| 2: Educational Coherence | 4-8 | Reviewer → quiz coherence; checkpoint gating enforced |
| 3: AI Efficiency | 9-12 | ~37% cost reduction; logging in place |
| 4: Thesis Foundation | 13-18 | Platform handles 50-150 page documents reliably |

After Phase 4, the platform is ready to begin building the "Thesis Intelligence" feature set on a stable, cost-controlled, security-hardened foundation.

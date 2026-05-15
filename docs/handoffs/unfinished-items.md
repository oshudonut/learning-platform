# Unfinished Items

Derived from the 4-agent architectural audit (2026-05-15). Items are grouped by stage and severity.

---

## Immediate — Before Next Deploy

### Run pending Supabase migrations
Both migration files are written but not yet executed in Supabase SQL Editor:

1. **`supabase/security_hardening_migration.sql`** (Stage 1)
   - Adds `user_id` column to `conversations` and `document_progressions`
   - Adds missing indexes: `documents_user_id_idx`, `documents_content_hash_uidx`, `user_profiles_xp_idx`
   - Must run before Stage 2 work that depends on those columns

2. **`supabase/final_isolation_hardening.sql`** (Stage 1 / C1)
   - **DESTRUCTIVE** — deletes all `user_id IS NULL` orphan rows first
   - Run advisory `SELECT COUNT(*)` queries before executing (instructions in file header)
   - Adds `NOT NULL` constraints to `documents`, `quiz_attempts`, `flashcard_sessions`
   - Recreates RLS policies without `OR user_id IS NULL` escape hatch

---

## Critical Security Issues (C-series)

### C1 — Cross-user document access [LIVE DATA EXPOSURE]
`getDocument(id)` in `lib/store.ts` has no `userId` filter. Any authenticated user who knows a document ID can read another user's full document. Also affects:
- `getProgression(documentId)` — non-ownership read path
- `getDocumentByContentHash(hash)` — hash collision returns another user's doc
- `saveFlashcardReviewStates(docId, states)` — no userId check
- `saveChunks(docId, chunks)` — no userId check

Fix: add `userId` param + `.eq("user_id", userId)` to each. `security_hardening_migration.sql` adds the columns; store functions need the guards.

### C2 — Checkpoint skip bypass [MASTERY GATE BROKEN]
`CheckpointChallenge.tsx` shows a "Skip Checkpoint" button when flashcard cards fail to load. Clicking it calls `complete_checkpoint` with clean completion status — no cards seen, gate bypassed. Reproducible on any network error.

Fix (DB-6): `complete_checkpoint` endpoint must require at least one `flashcard_review_event` record before accepting completion. Write `skipped=true` flag if no cards seen.

### C3 — Progression concurrent write race
`upsertProgression` is a full-row read-modify-write in application memory. Two tabs marking a section complete simultaneously → last-write-wins → checkpoint can be silently unmarked → quiz unlock blocked with no error.

Fix: Postgres-level `jsonb_set()` for atomic partial updates, OR optimistic locking on `updated_at` (reject stale writes with 409).

---

## Stage 2 — Educational Integrity (remaining)

- **DB-5 / AI-1 / C4** — `reviewer_topics` table: reviewer generation must write canonical topic titles post-generation; quiz route must read them and pass as hard constraint ("Cover ONLY these topics"). Without this, quiz questions can cover topics never taught in the reviewer.
- **DB-7 / H8** — Remediation gate: `complete_remediation` has no read-gate. User can call endpoint immediately after failing without reading remediation. Fix: require at least one section-read timestamp before unlocking quiz retry.

---

## Stage 3 — AI Efficiency

- **AI-2 / H1** — `getContextForGeneration(doc, maxChars)`: quiz and flashcard routes send uncapped `doc.text` (~50K tokens). Reviewer caps at 4K chars. Shared truncation function needed.
- **AI-4** — `HAIKU_MODEL` constant: open-answer grading and checkpoint flashcard generation are sub-500-token outputs. Routing to Haiku saves ~5x on those call paths.
- **AI-5 / H4** — Tutor prompt caching: `streamTutorResponse` re-sends full system prompt every turn. A 20-turn session pays full input token cost 20 times. Fix: `cache_control: { type: "ephemeral" }` on system prompt block.

---

## Stage 4 — Frontend Robustness

- **FE-1** — `submitDocRename` and `handleDocMove` have no rollback on failure. Silent failure diverges UI from DB state.
- **FE-2** — Multi-file upload surfaces only the first succeeded doc. Per-file status + link needed.
- **FE-4** — Session expiry mid-session triggers silent API failures rather than coordinated sign-out.

---

## Stage 5 — DB Performance

- **H6** — `listDocuments` SELECTs full JSON blobs (`reviewer`, `quiz`, `flashcards`, `chunks`) then discards them to compute boolean flags in JS. Transfers up to 1MB per doc row to get `hasReviewer: true`. Fix: exclude heavy columns, compute counts in SQL.
- **H9** — Missing indexes: `documents_user_id_idx`, `documents_content_hash_uidx`, `user_profiles_xp_idx` (in `security_hardening_migration.sql`, pending run).
- `updateDocument` — sequential read leg before update; replace with direct `.update()`.
- `getAnalytics` — no pagination.

---

## Other Pending (from CLAUDE.md)

- Workspaces feature: group documents into study workspaces (`workspaces` table, `workspace_id` on documents, Library grouping UI)
- Rotate `ANTHROPIC_API_KEY` — was accidentally exposed in a prior session

# Session Handoff — 2026-05-15

## Goal

Transform the Second Brain platform into a production-grade, fully private AI academic workspace. The immediate goal is to resolve critical security and educational integrity issues identified by a 4-agent architectural audit, then improve AI efficiency and frontend robustness.

---

## What Was Completed This Session

### User isolation + folders + reviewer setup — SHIPPED TO PRODUCTION

All items from the previous handoff are done and deployed:

- **Store layer** — `listDocuments(userId: string)` required, always filters by user. `deleteDocument(id, userId)` enforces ownership. `recordQuizAttempt`, `recordFlashcardSession`, `getAnalytics` all accept `userId` and filter per-user. Private `_updateAnalyticsMeta(userId, studyMinutes)` helper added. Full Folder CRUD added: `createFolder`, `listFolders`, `updateFolder`, `deleteFolder`, `moveDocumentToFolder`, `renameDocument`.
- **`/api/folders/route.ts`** — Created. GET lists folders, POST dispatches `create/update/delete/move_document/rename_document`.
- **API routes updated** — `/api/library` (auth + userId on DELETE), `/api/analytics` (auth + userId on all), `/api/upload` (accepts `folderId` + `reviewerName`), `app/page.tsx` (RecentDocuments now server-side auth).
- **UploadZone** — After upload, fetches folders and shows `ReviewerSetupModal`. `onConfirm` renames + moves doc then navigates. `onCancel` navigates without setup.
- **Library page** — Full rewrite: folder grid, unfiled section, folder drill-down, breadcrumb, inline folder rename/delete, per-doc three-dot menu (open, rename, move to folder, delete).
- **Auth cleanup** — Google OAuth removed from login and signup pages (email-only).
- **Database migration** — `supabase/folders_and_isolation_migration.sql` applied to production Supabase.
- **Committed** — `a9e1aeb` on `main`.
- **Deployed** — Live at `https://learning-platform-tau-topaz.vercel.app`.

### 4-Agent Architectural Audit — COMPLETE (research only, no implementation)

A collaborative audit was run across four domains. Full findings are in the previous conversation turn. Summary of what was found:

---

## Critical Issues Identified (Not Yet Fixed)

These are the output of the architectural audit. Nothing has been implemented yet.

### C1 — Cross-user document access [CRITICAL — live data exposure]
`getDocument(id)` in `lib/store.ts:94` has NO `userId` filter. Any authenticated user who knows a document ID can read another user's full document (text, reviewer, quiz, flashcards). The service-key Supabase client bypasses RLS entirely, making RLS policies decorative. Same exposure on:
- `getProgression(documentId)` — `lib/store.ts:455`
- `getDocumentByContentHash(hash)` — `lib/store.ts:440` (cross-user hash collision returns another user's doc)
- `saveFlashcardReviewStates(docId, states)` — no userId check
- `saveChunks(docId, chunks)` — no userId check
- `listConversations()` — no userId column on `conversations` table, no RLS

### C2 — Checkpoint skip bypass [CRITICAL — mastery gate broken]
`components/reviewer/CheckpointChallenge.tsx` shows a "Skip Checkpoint" button when flashcard cards fail to load. Clicking it calls `complete_checkpoint` via the progression API with a clean completion status — no cards seen, checkpoint marked done, mastery gate bypassed. Reproducible on any network error during checkpoint flashcard generation.

### C3 — Progression concurrent write race [CRITICAL]
`upsertProgression` in `lib/store.ts:458` is a full-row read-modify-write in application memory. Two tabs marking a section complete simultaneously produce a last-write-wins collision. A user can have a checkpoint silently unmarked and be blocked from quiz unlock with no error. Fix requires either Postgres-level `jsonb_set()` for atomic partial updates OR optimistic locking on `updated_at`.

### C4 — Reviewer→quiz coherence contract missing [CRITICAL]
Quiz generation (`app/api/quiz/route.ts`) sends raw `doc.text` (up to 200K chars) to Claude independently of the reviewer. Quiz topics are AI-chosen from the full document, not constrained to what the reviewer taught. A student can master a reviewer on topics A/B/C and be quizzed on D/E/F.

---

## High-Priority Issues (Not Yet Fixed)

- **H1** — Quiz and flashcard routes send uncapped raw `doc.text` (~50K tokens). Reviewer caps at 4K chars. Fix: shared `getContextForGeneration(doc, maxChars)` function.
- **H2** — `learningMethod` ignored by quiz, SM-2 flashcard deck, and checkpoint flashcards. Only reviewer uses it. Feynman learner gets board-exam quiz — pedagogically inconsistent.
- **H3** — Tutor RAG (keyword-based) silently fails for synonyms, terms ≤3 chars (pH, ATP), paraphrasing. Fallback is always `doc.text.slice(0, 3000)` regardless of where the answer sits.
- **H4** — Tutor has zero prompt caching. `streamTutorResponse` re-sends full system prompt every turn. A 20-turn session pays full input token cost 20 times.
- **H5** — `conversations` table has no `user_id` column and no RLS. Calling `listConversations()` with no documentId returns all users' tutor histories.
- **H6** — `listDocuments` SELECTs full JSON blobs (`reviewer`, `quiz`, `flashcards`, `chunks`) then discards them to compute boolean flags in JS. Transfers up to 1MB per doc row just to get `hasReviewer: true`.
- **H7** — 95% quiz threshold at 10 questions = zero tolerance (miss 1 = 90% = fail). Effectively a 100% gate.
- **H8** — `complete_remediation` has no read-gate. User can call the endpoint immediately after failing, unlock the quiz without reading remediation.
- **H9** — Missing DB indexes: `documents.user_id` (all user-scoped queries are sequential scans), `documents.content_hash` (dedup query is sequential scan), `user_profiles.xp` (leaderboard sort).
- **H10** — `submitDocRename` and `handleDocMove` in library page have no rollback. Silent failure diverges UI from DB.

---

## Negotiated Cross-Agent Contracts (From Audit)

These contracts must be implemented together — partial implementation of one without the other creates inconsistency.

### DB Contracts
- **DB-1**: `getDocument(id, userId)` — userId required, always `.eq("user_id", userId)`
- **DB-2**: `getProgression(documentId, userId)` — verify document ownership before returning
- **DB-3**: `upsertProgression` — include `updated_at` optimistic concurrency check; reject stale writes with 409
- **DB-4**: `listDocuments` SELECT must exclude heavy JSON columns; derive counts via SQL
- **DB-5**: After reviewer generation, write canonical `{ topicTitles[], contentHash }` to a new `reviewer_topics` table
- **DB-6**: `complete_checkpoint` — require at least one `flashcard_review_event` record; write `skipped=true` if no cards seen
- **DB-7**: `complete_remediation` — require at least one remediation section read timestamp
- **DB-8**: Folder delete — atomically null `folder_id` on member documents in same transaction

### AI Contracts
- **AI-1**: Quiz generation must read `reviewer_topics` and pass as hard constraint: "Cover ONLY these topics"
- **AI-2**: All generation routes must call shared `getContextForGeneration(doc, maxChars)`, never raw `doc.text`
- **AI-3**: Quiz, checkpoint, SM-2 flashcard generation must read `progression.learningMethod` and apply method-specific framing
- **AI-4**: Open-answer grading + checkpoint flashcard generation → downgrade to `claude-haiku-4-5`
- **AI-5**: `streamTutorResponse` must apply `cache_control: { type: "ephemeral" }` to system prompt block
- **AI-6**: Remediation topic list must be validated against `reviewer_topics.topicTitles` before AI call

### Frontend Contracts
- **FE-1**: All optimistic mutations (rename, move, delete) must capture previous state and roll back on failure
- **FE-2**: Multi-file upload must surface per-file status and link each succeeded doc, not just `firstDocId`
- **FE-3**: `LibraryPage` should be converted to Server Component; interactive logic extracted to client child
- **FE-4**: Session expiry mid-session must trigger coordinated sign-out, not silently failing API calls

---

## Staged Execution Plan

### Stage 1 — Security & Isolation [START HERE]
Files to touch: `lib/store.ts`, `supabase/` (new migration for `conversations.user_id`, `document_progressions.user_id`, missing indexes)

1. Add `userId` param to `getDocument`, `getProgression`, `getDocumentByContentHash`, `saveFlashcardReviewStates`, `saveChunks`
2. Add `user_id` column + RLS to `conversations` table
3. Add `user_id` column to `document_progressions` table
4. Add missing indexes: `documents_user_id_idx`, `documents_content_hash_uidx`, `user_profiles_xp_idx`
5. Remove `OR user_id IS NULL` from all RLS policies (after confirming no legacy user_id=NULL rows remain)
6. Update all API routes that call the patched store functions to pass `user.id`
7. Write and run new Supabase migration: `supabase/security_hardening_migration.sql`

### Stage 2 — Educational Integrity
1. Create `reviewer_topics` table (implements DB-5)
2. Wire reviewer generation to write canonical topic list post-generation
3. Update quiz route to read `reviewer_topics` and pass as constraint (AI-1)
4. Fix checkpoint skip bypass — add server-side guard requiring flashcard_review_event (DB-6)
5. Fix remediation gate — add section-read timestamp check (DB-7)
6. Wire `learningMethod` to quiz + flashcard + checkpoint prompts (AI-3)

### Stage 3 — AI Efficiency
1. Implement `getContextForGeneration(doc, maxChars)` shared function in `lib/claude.ts` (AI-2)
2. Apply to quiz and flashcard routes (removes 50K token waste per generation)
3. Add `HAIKU_MODEL` constant; route grading + checkpoint generation to Haiku (AI-4)
4. Add `cache_control` to tutor system prompt (AI-5)

### Stage 4 — Frontend Robustness
1. Add rollback to `submitDocRename` and `handleDocMove` (FE-1)
2. Fix multi-file upload modal gap (FE-2)
3. Add SM-2 due-date queue surfacing to flashcard study page
4. Add debounce to library search

### Stage 5 — DB Performance
1. Fix `updateDocument` to direct `.update()` (remove sequential read leg)
2. Fix `listDocuments` to exclude heavy JSON columns; compute counts in SQL
3. Add pagination to `getAnalytics`
4. Fix `submitAnswer` race in match mode (add FOR UPDATE lock or transaction)

---

## Files Actively In Progress / Partially Modified

None — all changes from this session are committed. The next session starts clean from `a9e1aeb`.

---

## What Was Tried and Failed

- **`NOTIFY pgrst, 'reload schema'`** — Ran in Supabase SQL Editor after migration but `folder_id` error persisted. Root cause was that the `ALTER TABLE documents ADD COLUMN folder_id` had silently been skipped because the `folders` table didn't exist yet when the full migration ran. Fix was to re-run `CREATE TABLE IF NOT EXISTS folders` + `ALTER TABLE` separately.

---

## Architecture Decisions Made This Session

1. **Service-key client bypasses RLS** — `lib/supabase.ts` uses `SUPABASE_SECRET_KEY`. RLS is defense-in-depth only. Primary isolation must be enforced via explicit `.eq("user_id", userId)` in every store function. This makes Stage 1 critical — RLS alone will never be sufficient given the service key.

2. **`/api/folders` uses action-based dispatch** — Single POST endpoint handles create/update/delete/move_document/rename_document via an `action` field. GET lists folders.

3. **ReviewerSetupModal is post-upload, not pre-upload** — Upload saves the doc with filename-derived title. Modal collects name/folder/method after upload. Reviewer generation happens on the document page as before.

4. **`reviewer_topics` table (proposed, not yet built)** — The correct fix for the reviewer→quiz coherence gap is a normalized table, not passing the full reviewer JSON to the quiz prompt. This is the key architectural addition for Stage 2.

5. **Haiku for sub-500-token output tasks (proposed, not yet built)** — Open-answer grading and checkpoint flashcard generation are Haiku candidates. Saves ~5x on those call paths.

---

## Key Reference: Architectural Audit

The 4-agent collaborative audit produced detailed findings across DB, AI, educational systems, and frontend domains. The full cross-agent report including all contracts and the dependency map is in the conversation context of this session. If starting fresh, the staged plan above is the distilled implementation roadmap — Stage 1 (Security & Isolation) is the mandatory first move.

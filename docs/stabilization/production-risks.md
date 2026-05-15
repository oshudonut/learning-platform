# Production Risks

Every risk that could cause production failures, data leaks, or silent data corruption.

Severity scale: Critical = data loss or unauthorized data access; High = user-visible failures or security holes; Medium = silent data integrity issues or cost exposure; Low = degraded UX with no data impact.

---

## Critical

### CRIT-1: `getLatestRemediationReviewer` has no user ownership filter
**File**: `lib/store.ts` line 564, `app/api/remediation/route.ts` line 36
**Description**: `getLatestRemediationReviewer(documentId)` queries `remediation_reviewers` by `document_id` only. The `remediation_reviewers` table has no `user_id` column (confirmed in `supabase/progression_schema.sql`). Any authenticated user who knows another user's document ID can call `POST /api/remediation` with `action: "get"` and receive the remediation reviewer content — including the weak topics list, which reveals what the original user struggled with.
**Impact**: Cross-user data leak of study content and performance data.
**Fix**: Add `user_id` column to `remediation_reviewers`, filter by it in `getLatestRemediationReviewer`.

### CRIT-2: `getCheckpointFlashcards` has no user ownership filter
**File**: `lib/store.ts` line 538, `app/api/checkpoint-flashcards/route.ts` line 22
**Description**: `action === "get"` on the checkpoint-flashcards route calls `getCheckpointFlashcards(documentId, checkpointIndex)`, which queries `checkpoint_flashcards` by `document_id` and `checkpoint_index` only — no `user_id`. The `checkpoint_flashcards` table has no `user_id` column (`supabase/progression_schema.sql`).
**Impact**: Cross-user data leak of checkpoint flashcard content.
**Fix**: Add `user_id` column to `checkpoint_flashcards`, filter by it.

### CRIT-3: `grade-open` route has no authentication
**File**: `app/api/quiz/grade-open/route.ts`
**Description**: This route has no `createSupabaseServer()` call and no user check. Any HTTP client — unauthenticated — can POST to `/api/quiz/grade-open` with arbitrary content and trigger a Claude API call, consuming Anthropic API credits.
**Impact**: Cost exposure; potential abuse for prompt injection against the grading prompt.
**Fix**: Add standard auth check (4 lines, same pattern as every other route).

### CRIT-4: `security_hardening_migration.sql` has not been run
**File**: `supabase/security_hardening_migration.sql`, HANDOFF.md
**Description**: The HANDOFF.md explicitly notes this migration is still pending. This migration adds: (1) `user_id` to conversations, (2) RLS policies for conversations, (3) the critical DB indexes (H9), (4) tightened RLS on documents removing the `OR user_id IS NULL` escape hatch.
**Impact**: Conversations are not isolated by user (any user can query another user's conversations if they know the conversation ID). Missing indexes cause full table scans on every document/conversation lookup.
**Fix**: Run the migration in the Supabase SQL Editor immediately.

---

## High

### HIGH-1: Race condition in `upsertProgression` (C3)
**File**: `lib/store.ts` `upsertProgression()`, multiple routes
**Description**: Every progression mutation (complete_section, complete_checkpoint, complete_quiz, etc.) reads the full progression row, mutates it in memory, then writes the whole row back. Two tabs open simultaneously can produce: Tab A reads row, Tab B reads same row, Tab A writes (marks section 3 done), Tab B writes (marks section 4 done, but with the stale section 3 = incomplete state from its earlier read). Net result: Tab A's section completion is silently overwritten.
**Impact**: Silent data loss — completed sections, checkpoints, or quiz unlocks can be reverted without any error.
**Fix**: Use Postgres-level `jsonb_set()` partial updates or an `updated_at` optimistic lock that returns a conflict on stale write.

### HIGH-2: `updateDocument` reads then writes — sequential round trip
**File**: `lib/store.ts` `updateDocument()` lines 129-139
**Description**: Every document update (after reviewer, quiz, flashcard generation) does `getDocument(id, userId)` then `saveDocument(updated)`. This is two sequential Supabase calls. If two generation calls complete concurrently for the same document (unlikely but possible), the second write overwrites the first's result.
**Impact**: Could cause reviewer, quiz, or flashcard content to be overwritten silently.
**Fix**: Replace with a direct `.update()` call that sends only the changed fields.

### HIGH-3: Middleware does not protect API routes
**File**: `middleware.ts`
**Description**: `PROTECTED_ROUTES` only includes page routes (`/document`, `/library`, etc.), not API routes (`/api/...`). Individual API routes do their own auth checks, so this is currently safe. But any new route added without a `getUser()` call would be unprotected and invisible to middleware.
**Impact**: Single point of failure — any route missing its auth check is publicly accessible.
**Risk level**: Not currently a bug, but a systemic fragility.

### HIGH-4: Temporary upload files are orphaned on processing failure
**File**: `app/api/upload/route.ts` line 172
**Description**: The `admin.storage.from(BUCKET).remove([storageKey]).catch(() => {})` cleanup is only reached if processing succeeds. If text extraction, OCR, or DB write fails, the catch block at line 183 returns a 500 but the temp file remains in `temp-uploads` indefinitely.
**Impact**: Storage consumption grows unboundedly. No automatic TTL. Files may contain user documents (PII) sitting in temporary storage.

### HIGH-5: Checkpoint skip bypass (C2 from handoff)
**File**: `app/api/progression/route.ts` `complete_checkpoint` action
**Description**: The `complete_checkpoint` action marks a checkpoint complete without verifying that the flashcard challenge was actually done. There is also no server-side verification that `flashcard_review_event`s exist. A client can POST `{ action: "complete_checkpoint", ... }` directly to skip the flashcard requirement.
**Impact**: Educational integrity failure — users can bypass the checkpoint learning requirement.

### HIGH-6: `complete_remediation` in progression route has no read-time gate (H8)
**File**: `app/api/progression/route.ts` `complete_remediation` action
**Description**: When the client POSTs `complete_remediation`, the server immediately sets `quizUnlocked = true` without checking whether the user actually read the remediation sections. A user can call this endpoint immediately after a failed quiz to re-unlock the quiz.
**Impact**: Remediation gate is bypassable — student re-takes quiz without studying weak topics.

### HIGH-7: `ANTHROPIC_API_KEY` rotation pending
**File**: `CLAUDE.md` (Pending Work section)
**Description**: The CLAUDE.md notes the API key was accidentally exposed in a prior session and rotation is needed. If the key has not been rotated, it remains compromised.
**Impact**: Unauthorized Claude API usage charged to the account.

---

## Medium

### MED-1: `listDocuments` still selects full reviewer, quiz, and flashcard JSON (H6)
**File**: `lib/store.ts` `listDocuments()` line 155
**Description**: The SELECT statement includes `reviewer, quiz, flashcards` — full JSONB columns. The function then only uses them to compute boolean flags (`hasReviewer`, `hasQuiz`, `hasFlashcards`) and counts. These can be computed in SQL with `reviewer IS NOT NULL` and `jsonb_array_length(flashcards)`. For a user with 20 documents, each with a 50KB reviewer JSON, this is 1 MB of data transferred on every library page load.
**Impact**: Performance degradation; elevated Supabase data egress.

### MED-2: Missing DB indexes (H9) — before security_hardening_migration runs
**File**: `supabase/security_hardening_migration.sql`
**Description**: Without the migration, `documents_user_id_idx`, `user_profiles_xp_idx`, and conversation indexes do not exist. Every `listDocuments`, `getDocument`, and conversation lookup does a full table scan.

### MED-3: Analytics routes have no pagination
**File**: `lib/store.ts` `getAnalytics()` lines 389-406
**Description**: `getAnalytics` fetches ALL quiz_attempts and flashcard_sessions for a user with no LIMIT. A power user with 500 quiz attempts and 1,000 flashcard sessions will transfer the full history on every analytics page load.

### MED-4: `doc.text` and `doc.chunks` inconsistent for long documents
**File**: `app/api/upload/route.ts` lines 148-149
**Description**: `storedText` is capped at `TEXT_STORE_CAP = 60,000` characters, but `chunkText(text)` operates on the uncapped full text. For a 200K-char document: `doc.text = first 60K chars`, `doc.chunks = full 200K chars chunked`. The tutor uses `doc.text` for retrieval (`retrieveContext(doc.text, ...)`), missing the content in chunks 8-n. The reviewer uses the compressed form of `doc.text` (also truncated). Quiz and flashcard generation use `doc.text` (60K cap). Only the chunk-based tutor RAG and (if it existed) embedding search would use full content.

### MED-5: Content hash is only 12 hex chars
**File**: `lib/store.ts` `computeContentHash()` line 455
**Description**: SHA-256 is truncated to 12 hex characters (48 bits). For a personal tool with one user, collision probability is negligible. For a multi-user deployment with millions of documents, birthday paradox probability becomes relevant. This is low risk at current scale.

### MED-6: `analytics_meta` uses a singleton row pattern (legacy)
**File**: `supabase/schema.sql` line 47-53
**Description**: `analytics_meta` has `id integer primary key default 1` with a `CHECK (id = 1)` constraint, enforcing a single row. The security hardening migration adds `user_id` to this table and per-user RLS. The singleton constraint conflicts with per-user rows. The `final_isolation_hardening.sql` migration adds RLS but the schema constraint may prevent inserting user-specific rows if it wasn't also migrated.

---

## Low

### LOW-1: `deleteConversation` has no user ownership filter
**File**: `lib/store.ts` `deleteConversation()` line 314
**Description**: `deleteConversation(id)` deletes by `id` only, no `user_id` filter. Called from somewhere in the frontend — if any route exposed this without ownership validation, it would be a bug. Currently not directly routed, but the function is a latent risk.

### LOW-2: `getDocumentTitle` has no user ownership filter
**File**: `lib/store.ts` `getDocumentTitle()` line 119
**Description**: Returns a document title by ID without checking `user_id`. Returns only the title (not content), so data exposure is minimal. Used internally.

### LOW-3: Supabase service role key used server-side only but stored in env
**File**: `.env.local` / Vercel environment variables
**Description**: `SUPABASE_SECRET_KEY` is the service role key — it bypasses all RLS. It is used correctly in `lib/supabase.ts` (server-only). Risk: if it appears in any client-side bundle, all RLS is defeated. Current Next.js setup (server-only imports) makes this unlikely but worth confirming with a bundle scan.

### LOW-4: CORS not explicitly configured
**File**: No `next.config.js` CORS headers set
**Description**: API routes do not set `Access-Control-Allow-Origin` headers. By default, Next.js API routes respond to same-origin requests and can be configured to allow cross-origin. If not set, a malicious page from another origin cannot call these APIs from the browser (SameSite cookies). Not a production risk for a same-domain app.

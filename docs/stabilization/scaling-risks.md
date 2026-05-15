# Scaling Risks

What breaks first under load, and at what scale it becomes a problem.

Current scale: single user, development/prototype. Target scale for near-term: 100 active users.

---

## Database Query Patterns

### DB-1: Full table scans on documents (until migration runs)
**Issue**: Without `documents_user_id_idx` (from `security_hardening_migration.sql`, which has not been run), every `listDocuments`, `getDocument`, `getDocumentByContentHash`, `deleteDocument`, and `moveDocumentToFolder` performs a sequential scan of the entire `documents` table filtered by `user_id`. Supabase Postgres will use the primary key index for single-row lookups by `id`, but `user_id` lookups are unindexed.
**Breaks at**: ~500 documents across all users — scans become noticeably slow (>100ms).
**Fix**: Run `security_hardening_migration.sql` to add `documents_user_id_idx`.

### DB-2: `getAnalytics` fetches unbounded rows
**Issue**: `getAnalytics` in `lib/store.ts` lines 390-406 fetches ALL `quiz_attempts` and ALL `flashcard_sessions` for a user without a LIMIT clause. A study-intensive user accumulating 100 quiz attempts and 500 flashcard sessions will transfer all rows to Node on every analytics page load.
**Breaks at**: ~200 combined rows — response payload exceeds 500KB, latency increases.
**Fix**: Add a LIMIT (e.g., last 100 attempts) or paginate analytics queries.

### DB-3: `getAnalytics` makes 3 parallel queries every call
**Issue**: Three parallel Supabase calls via `Promise.all` on every analytics page load. Each call is a separate Supabase connection. Supabase free tier has a connection limit (~50 concurrent on free, ~100 on pro); each Serverless function invocation holds connections open for the duration of the request.
**Breaks at**: ~30 concurrent users on analytics page — connection pool exhaustion.

### DB-4: `updateDocument` always does read + write
**Issue**: `updateDocument(id, userId, patch)` fetches the existing document (full row including `text`, `reviewer`, `quiz`, `flashcards` JSONB blobs) then saves the merged result. After every AI generation, the full document row (potentially 100KB+) is transferred from Supabase → Node just to merge a small patch, then written back.
**Breaks at**: Any meaningful concurrent load — each generation pipeline holds a DB connection open for the duration of the double round-trip.
**Fix**: Use `.update(patch).eq("id", id).eq("user_id", userId)` directly.

### DB-5: `listDocuments` transfers full JSONB blobs (H6)
**Issue**: The SELECT in `listDocuments` fetches `reviewer`, `quiz`, and `flashcards` columns even though only boolean/count metadata is needed. A reviewer JSON can be 15-30KB; a quiz 8-15KB; flashcards 10-20KB. For 20 documents per user: up to 1.3 MB transferred per library page load.
**Breaks at**: Users with 15+ documents — library page becomes slow; egress costs increase.

---

## Missing Indexes

### IDX-1: `documents.user_id` — missing until migration runs
Affects: `listDocuments`, `getDocument`, `deleteDocument`, `moveDocumentToFolder`, `renameDocument`, `saveFlashcardReviewStates`, `getFlashcardReviewStates`, `getChunks`, `saveChunks`.

### IDX-2: `conversations.user_id` — missing until migration runs
Affects: `listConversations`, `saveConversation`.

### IDX-3: `conversations.document_id` — missing until migration runs
Affects: `listConversations` when filtered by `documentId`.

### IDX-4: `user_profiles.xp DESC` — missing until migration runs
Affects: `getLeaderboard` — full table scan on every leaderboard request.

### IDX-5: `quiz_attempts.user_id`, `flashcard_sessions.user_id`
Not created in any migration file reviewed. `getAnalytics` filters by `user_id` on both tables. Without indexes, full scans grow with every quiz attempt and flashcard session across all users.

---

## N+1 Query Patterns

### N+1-1: `getPendingRequests` — 2 queries per call
`getPendingRequests` fetches pending friend requests then fetches a batch of profiles with `in("id", requesterIds)`. This is a 2-query pattern (acceptable) — not a true N+1. The profile fetch is batched correctly.

### N+1-2: `awardXp` — read-modify-write + log upsert
`awardXp` does: `getProfile` → compute → `supabase.update` → `supabase.select xp_log` → `supabase.upsert xp_log`. That is 4 sequential round-trips on every XP award event. Called after quiz completion and flashcard sessions.

### N+1-3: Progression + Document fetched separately in multiple routes
`complete_section` in `progression/route.ts` does: `getProgression` → then conditionally `getDocument` to get `totalSections`. These are sequential. For a frequent operation (marking sections complete), two round-trips per call is expensive.

---

## Large Payload Routes

### PAYLOAD-1: Quiz and Flashcard generation — 60K char document body
As documented in the AI audit, quiz and flashcard routes send up to 15,000 tokens to Claude. The Anthropic API call itself holds the Vercel function's 120-second timeout window. Under high concurrency, multiple concurrent 120s functions can exhaust Vercel's concurrency limit.

### PAYLOAD-2: PDF OCR — 25MB base64 in-memory
The upload route downloads the file from storage into memory as `Buffer`, converts to base64 for OCR, and holds all of this in Node process memory. A 25MB PDF as base64 is ~33MB of string. On Vercel Serverless (1GB memory cap per function), this is fine for single requests but could cause memory pressure under concurrent uploads.

### PAYLOAD-3: Export route — builds DOCX in memory
`export/route.ts` uses `@react-pdf/renderer` (no, actually `docx` library) to build the DOCX in memory before streaming it. For a 6-topic standard reviewer, the DOCX is small (< 100KB). Not a scaling concern at current scope.

---

## Cold Start Sensitivity

### COLD-1: PDF parsing (`pdfjs-dist`) and Mammoth are large dependencies
`pdf-parse` is excluded from Next.js bundling via `serverComponentsExternalPackages`. This means it is loaded from `node_modules` at runtime, avoiding bundle size issues but contributing to cold start time on Vercel Serverless. The upload route is the most cold-start-sensitive (users expect immediate feedback after selecting a file).

### COLD-2: Anthropic SDK initialization
The Anthropic client is initialized at module load time (`const claude = new Anthropic({ apiKey })`). This is fine — the SDK does not make network calls at initialization.

---

## Supabase Connection Limits

Supabase Free tier: ~50 concurrent connections. Pro tier: ~100 (direct) + pgBouncer pooler.

The `lib/supabase.ts` creates a **module-level singleton** Supabase client using the service role key. In Vercel Serverless, each function invocation may create a new Node process (with a new module load), each with its own Supabase client. At 100 concurrent function invocations, 100 connections would be open simultaneously — hitting the free-tier limit.

**Fix**: Use the Supabase connection pooler (transaction mode) for all server-side operations. This is set in the connection string, not in code.

---

## Claude API Rate Limits

Anthropic rate limits for the `claude-sonnet-4-5` model (as of 2026):
- Requests per minute (RPM): varies by tier; typically 50-500 RPM
- Tokens per minute (TPM): typically 100K-800K TPM

At 100 users generating quizzes simultaneously (each quiz = ~15K input tokens + ~3K output), 100 simultaneous requests = 1.8M tokens/minute — potentially hitting TPM limits.

**Risk**: Claude API returns 429 errors. Routes do not have retry logic — they surface the 429 directly to the user as a 500.

---

## Vercel Function Concurrency

Vercel Serverless Functions scale horizontally. Each function can run concurrently (up to plan limits). The main concurrency risks:

1. **Upload processing**: 60-second `maxDuration`, memory-intensive (OCR). Heavy uploads saturate function memory.
2. **Reviewer/Quiz/Flashcard generation**: 120-second `maxDuration`. Long-running functions tie up concurrency slots.

Vercel Hobby plan: 100 concurrent executions. Pro: 1,000. At 100 users simultaneously generating content, the hobby limit is easily hit.

---

## Summary — Break Points by User Count

| Scale | Issue |
|---|---|
| 10 users | No issues if DB indexes exist |
| 50 users | Analytics queries slow without pagination; connection pooling starts to matter |
| 100 users | `listDocuments` JSONB payload causes slow library page; Claude API rate limits become possible; Supabase connection limit risk without pooler |
| 200+ users | Full table scans on unindexed tables cause >500ms query times; `updateDocument` double round-trip compounds |
| 500+ users | Vercel concurrency limits hit during peak study times; Supabase connection exhaustion without pooler |

# Immediate Fixes

Fixes that should be done before any new features are added. Ordered by severity.

Maximum 10 items. Each entry: file to change, what to change, effort (S=hours, M=day, L=2-3 days), blocking reason.

---

## FIX-1: Run `security_hardening_migration.sql` in Supabase
**File**: `supabase/security_hardening_migration.sql`
**What to change**: Execute this file in Supabase SQL Editor (Dashboard → SQL Editor). It adds `user_id` to conversations, RLS policies for conversations, the three critical indexes (`documents_user_id_idx`, `user_profiles_xp_idx`, conversation indexes), and tightens document RLS.
**Effort**: S (< 5 minutes to run; no code changes)
**Blocking because**: Without this, conversations are not user-isolated (any authenticated user with a conversation ID can access it). Every `listDocuments` and `getDocument` call does a full table scan. The security_hardening_migration is a prerequisite for all subsequent DB fixes.
**Risk**: The migration has a conditional block — if documents with `user_id IS NULL` still exist, RLS tightening is skipped with a RAISE NOTICE. Verify before and after.

---

## FIX-2: Add auth check to `grade-open` route
**File**: `app/api/quiz/grade-open/route.ts`
**What to change**: Add `createSupabaseServer()` + `getUser()` at the top of the POST handler. Return 401 if no user. Four lines, same pattern as every other route.
```ts
const supabase = createSupabaseServer();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
**Effort**: S (< 10 minutes)
**Blocking because**: Unauthenticated callers can trigger Claude API calls freely. This is both a security hole (cost exposure) and a potential abuse vector. One of two routes without any auth — the other being middleware-only protected page routes.

---

## FIX-3: Add ownership filters to `checkpoint-flashcards` (action=get) and `remediation` (action=get)
**Files**: `app/api/checkpoint-flashcards/route.ts` line 22, `app/api/remediation/route.ts` line 36, `lib/store.ts`
**What to change**:
- In `checkpoint-flashcards` action=get: verify document ownership via `getDocument(documentId, user.id)` before calling `getCheckpointFlashcards`. If doc not found, return 404.
- In `remediation` action=get: same — call `getDocument(documentId, user.id)` first.
- Add `user_id` column to `checkpoint_flashcards` and `remediation_reviewers` tables in a new migration. Filter by `user_id` in the store functions.
**Effort**: M (1-2 hours for code; add migration SQL)
**Blocking because**: Any authenticated user who knows a `documentId` can retrieve another user's checkpoint flashcards and remediation content, including their weak-topic performance data (CRIT-1 and CRIT-2).

---

## FIX-4: Add try/catch to export route and fix adaptive reviewer DOCX
**File**: `app/api/export/route.ts`
**What to change**:
1. Wrap the entire handler body in a try/catch that returns `{ error: message }` on failure (currently the route has no error handling — any failure produces an unhandled 500 with no body).
2. Add a schema type check before `buildDocx`: if `doc.reviewer` has a `type` field (adaptive reviewer), either: (a) return a 422 with "DOCX export is only available for standard reviewers", or (b) add export logic for each schema type.
**Effort**: S for (1); M for (2) if implementing all schema types
**Blocking because**: A user with an adaptive reviewer who clicks export gets a silent broken DOCX with no error message. The missing try/catch means any DOCX build failure returns an unhandled Next.js 500 page.

---

## FIX-5: Move temp file cleanup to `finally` block in upload route
**File**: `app/api/upload/route.ts`
**What to change**: Move the `admin.storage.from(BUCKET).remove([storageKey]).catch(() => {})` call from after `saveChunks` (line 172, inside the try block) to a `finally` block. The `storageKey` must be captured before the try/catch for the finally block to access it.
```ts
let storageKey: string | undefined;
try {
  storageKey = body.storageKey;
  // ... all processing ...
} catch (err) {
  // error handling
} finally {
  if (storageKey) {
    admin.storage.from(BUCKET).remove([storageKey]).catch(() => {});
  }
}
```
**Effort**: S (15 minutes)
**Blocking because**: Any processing failure leaves user files orphaned in `temp-uploads` indefinitely. Files may contain PII (medical study materials, personal notes). Storage accumulates unboundedly.

---

## FIX-6: Switch `grade-open` to Haiku model
**File**: `app/api/quiz/grade-open/route.ts`, `lib/claude.ts`
**What to change**:
1. Add `export const HAIKU_MODEL = "claude-haiku-3-5"` constant to `lib/claude.ts`.
2. In `grade-open/route.ts`, call `generateStructured` with the Haiku model. Since `generateStructured` uses the module-level `MODEL` constant, the cleanest fix is to add a `model?` parameter to `GenerateOpts` in `lib/claude.ts` and pass `HAIKU_MODEL` from the grading route.
**Effort**: S (30 minutes)
**Blocking because**: Grading is the highest-frequency per-user Claude call (4-6 times per quiz attempt). It uses Sonnet at $3/MTok when Haiku ($0.80/MTok) produces equivalent results for this simple task. This is a 4× cost reduction on every open-answer submission.
**Note**: Also apply Haiku to `ocrImageWithVision` in `upload/route.ts` (remove hardcoded `claude-opus-4-5`).

---

## FIX-7: Cache tutor system prompt (H4)
**File**: `lib/claude.ts` `streamTutorResponse()`
**What to change**: Change `streamTutorResponse` to accept the system prompt as a structured block array, not a plain string. Mark the static portion with `cache_control: { type: "ephemeral" }`.

Current:
```ts
system: systemPrompt,
```
Required:
```ts
system: [
  { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
],
```
The Anthropic streaming API accepts `system` as an array of content blocks. This change requires updating the `streamTutorResponse` signature from `systemPrompt: string` to `systemPrompt: string` (keep interface; change internal construction).
**Effort**: S (20 minutes)
**Blocking because**: Every tutor message re-sends the full system prompt (~1,430 tokens) as uncached input. For a 20-turn session, this is 28,600 tokens of unnecessary input. At $3/MTok: $0.086 wasted per session. With 100 users averaging 10 tutor messages/month: $12.90/month in avoidable cost.

---

## FIX-8: Cap document text in quiz and flashcard routes
**Files**: `app/api/quiz/route.ts`, `app/api/flashcards/route.ts`, `lib/pdf.ts`
**What to change**: In both routes, replace `documentText: doc.text` with a capped version. `lib/pdf.ts` already exports `extractSummarySlice(text, maxChars=40_000)`. Use it:
```ts
import { extractSummarySlice } from "@/lib/pdf";
// ...
documentText: extractSummarySlice(doc.text, 40_000),
```
This caps quiz/flashcard input at 40K chars (≈10K tokens) instead of the uncapped 60K.
**Effort**: S (15 minutes for both routes)
**Blocking because**: AI-2 from the handoff — uncapped `doc.text` is the largest cost driver per document. Each quiz or flashcard generation on a max-length document costs ~$0.09-0.11 in input tokens alone. The `extractSummarySlice` function is already implemented; this is a one-line change per route.

---

## FIX-9: Remove `createBucket` idempotency call from presign route
**File**: `app/api/upload/presign/route.ts`
**What to change**: Delete lines 20-23 (the `await admin.storage.createBucket(...)` call). The `temp-uploads` bucket is created by `supabase/storage_migration.sql` and already exists in production. Every presign request is making an unnecessary round-trip to Supabase's storage API.
**Effort**: S (< 5 minutes)
**Blocking because**: Not blocking per se, but adds latency to every upload initiation and makes unnecessary Supabase API calls. Low effort, clean removal.

---

## FIX-10: Add missing error logging to routes
**Files**: `app/api/remediation/route.ts`, `app/api/checkpoint-flashcards/route.ts`, `app/api/progression/route.ts`, `app/api/export/route.ts`, `app/api/tutor/route.ts` (streaming error branch)
**What to change**: In each catch block, add `console.error("[route-name] error:", message)` before the return statement. For the tutor streaming error (inside ReadableStream), add `console.error("[tutor] streaming error:", msg)`.
**Effort**: S (20 minutes total)
**Blocking because**: Production errors in these routes are invisible. If remediation generation breaks for all users, there is no log evidence. Required for any meaningful incident response.

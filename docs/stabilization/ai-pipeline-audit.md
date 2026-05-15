# AI Pipeline Audit

Covers all Claude API call sites: reviewer, quiz, flashcard, checkpoint-flashcard, tutor, remediation, and OCR.

---

## Shared Infrastructure

### `generateStructured()` — `lib/claude.ts`
All non-streaming structured generation routes go through this single wrapper. It:
- Uses `MODEL = "claude-sonnet-4-5"`.
- Places the document text as the second system block with `cache_control: { type: "ephemeral" }`.
- Parses the response as JSON, then validates with the provided Zod schema.
- Returns `{ parsed, cacheReadTokens, cacheWriteTokens }`.

This is the correct caching setup for document-scoped generation: the system preamble + document text block gets cached, and the per-call `taskInstruction` in the user message remains uncached. Good design.

**Critical gap**: the cache is only effective when the system preamble AND document text are identical across calls. The reviewer, quiz, and flashcard routes all pass `SYSTEM_PREAMBLE` as preamble and `doc.text` as document text, so cache hits ARE possible across these calls for the same document. However: the reviewer route passes `compressedText` (the compressed form), while quiz and flashcard routes pass the full `doc.text` with no compression. These are different strings — the cache prefix does NOT match across reviewer → quiz and reviewer → flashcards for the same document.

### `streamTutorResponse()` — `lib/claude.ts`
The tutor uses streaming. The system prompt is passed as a plain string (not a cached block). This is issue H4 from the handoff: 20-turn sessions pay full input cost on every turn because the system prompt is not marked ephemeral.

---

## Route-by-Route Audit

### 1. Reviewer — `app/api/reviewer/route.ts`

**Model**: claude-sonnet-4-5 (via `generateStructured`)
**Prompt size**: Compressed document text via `compressDocumentForReview(doc.text, maxChars=4000)`. The compressed text is capped at 4,000 characters. This is aggressive compression — for large documents, 4K chars may lose significant content.
**maxTokens**: 8,000 for standard schema; 12,000 for adaptive schemas.
**Caching**: Document text block marked ephemeral — correct. Cache key: `SYSTEM_PREAMBLE + compressed`.
**Streaming**: No — returns full JSON.
**maxDuration**: 120 seconds — appropriate.
**Zod validation**: Yes, via `generateStructured`. Schema varies by `schemaType` (standard/conceptual/retrieval/memory/relational).
**Method-awareness**: Yes — `learningMethod` and `studyMode` read from request body, falling back to progression.
**Error handling**: Catches all errors, returns 500 with message string. No retry logic.

**Issue**: The reviewer uses 4K chars of compressed text. The quiz and flashcard routes use the full uncapped `doc.text` (potentially 60K chars). This means the reviewer is generated from a different, much smaller slice of the document than the quiz/flashcards. If important content falls outside the compressed 4K, the reviewer will miss it but the quiz might cover it. See also AI-2 in the handoff.

**Issue**: When `force: true`, the route regenerates without checking for an existing reviewer first. This is intentional but could be expensive if accidentally triggered from the frontend.

---

### 2. Quiz — `app/api/quiz/route.ts`

**Model**: claude-sonnet-4-5
**Prompt size**: Full `doc.text` — no cap, no compression. This is AI-2 from the handoff: large documents can send ~50K+ characters to Claude. At ~4 chars/token, that is 12,500+ input tokens just for document text.
**maxTokens**: 10,000
**Caching**: Document text block marked ephemeral. Cache key: `SYSTEM_PREAMBLE + doc.text`. Different from reviewer (which uses compressed text), so no cross-route cache hit.
**Streaming**: No.
**maxDuration**: 120 seconds.
**Zod validation**: `ExtendedQuizSchema` — validates question types, correctIndex, etc.
**Quiz lock check**: Reads progression and returns 423 if `!quizUnlocked`. Correct server-side enforcement.
**Method-awareness**: Yes — `learningMethod` from progression is passed to `buildQuizTask`.

**Issue**: Full `doc.text` passed without cap (AI-2). For a 50K-char document, input tokens are 12,500+ per quiz generation. At $3/MTok input for Sonnet 4.5, that is ~$0.04 per quiz generation.

**Issue**: No cap on question count — `buildQuizTask` defaults to `questionCount ?? 10` but the caller never passes `questionCount`, so it is always 10. This is fine but undocumented.

---

### 3. Flashcards — `app/api/flashcards/route.ts`

**Model**: claude-sonnet-4-5
**Prompt size**: Full `doc.text` — same AI-2 issue as quiz. No cap.
**maxTokens**: 10,000
**Caching**: Document text block marked ephemeral. Same cache key issue as quiz — no match with reviewer.
**Streaming**: No.
**maxDuration**: 120 seconds.
**Zod validation**: `FlashcardsSchema`.
**Method-awareness**: Yes — `learningMethod` from progression.

**Issue**: Same AI-2 uncapped document text issue.
**Issue**: `doc.flashcards?.length && !force` check does not validate whether the existing flashcards match the current learning method. If a user changes their learning method and regenerates, they get fresh flashcards. But if they don't force-regenerate, they get stale method-mismatched flashcards.

---

### 4. Checkpoint Flashcards — `app/api/checkpoint-flashcards/route.ts`

**Model**: claude-sonnet-4-5
**Prompt size**: `topicContent = JSON.stringify(coveredTopics)` — this is the serialized reviewer topics for the covered sections, not the raw document text. This is appropriate — checkpoint cards cover specific sections.
**maxTokens**: 1,500 — correct, this is a small generation (5-8 cards).
**Caching**: Ephemeral cache on `topicContent`. Cache will rarely hit since topic content varies per checkpoint.
**Streaming**: No.
**maxDuration**: No `maxDuration` set — defaults to Vercel limit (10s hobby / 60s pro). For a small 1,500 token generation this should be fine, but there is no explicit protection.
**Zod validation**: `FlashcardsSchema` — same schema as regular flashcards.
**Method-awareness**: Yes — `learningMethod` from progression.

**Issue**: No `maxDuration` set. If Sonnet is slow (high load), 10s may be insufficient for even small generations.

**Issue**: The `action === "get"` path (line 22) calls `getCheckpointFlashcards(documentId, checkpointIndex)` with NO user ownership check. `getCheckpointFlashcards` in `lib/store.ts` queries by `document_id` and `checkpoint_index` only — no `user_id` filter. Any authenticated user who knows another user's `documentId` and `checkpointIndex` can retrieve their checkpoint flashcards.

**Issue**: The `action === "generate"` path calls `getDocument(documentId, user.id)` — correct ownership check. But then the progression fetch via `getProgression(documentId, user.id)` also checks ownership. Good.

---

### 5. Tutor — `app/api/tutor/route.ts`

**Model**: `TUTOR_MODEL = "claude-sonnet-4-5"` (same model as structured generation — no cost differentiation).
**Prompt size**: System prompt = `buildTutorSystemPrompt(method)` + document context from `retrieveContext(doc.text, message, maxChars=3000)`. The context retrieval is keyword-based, capped at 3,000 characters — reasonable for a tutor.
**maxTokens**: 1,500 — appropriate for conversational responses.
**Caching**: No caching on the system prompt (H4). The full system prompt + document context is sent on every turn. For a 20-turn session, the system prompt (~1,500-2,000 chars ≈ 375-500 tokens) is paid 20 times.
**Streaming**: Yes — `streamTutorResponse()` returns an async iterable.
**maxDuration**: 60 seconds.
**Zod validation**: Not applicable — streaming text response.
**Method-awareness**: Yes — `learningMethod` from progression shapes both the system prompt (via `buildTutorSystemPrompt`) and the suggested questions (via `METHOD_SUGGESTED_QUESTIONS` in `TutorChat.tsx`).
**Conversation history**: Last 20 messages are sent (`.slice(-20)`) — reasonable token cap.

**Issue (H4)**: `streamTutorResponse()` passes `systemPrompt` as a plain string, not as a messages array with `cache_control`. The Anthropic SDK's streaming `.stream()` call accepts `system` as a string — to cache it, it must be passed as an array of content blocks with `cache_control: { type: "ephemeral" }` on the system text block. This is not done. A 20-turn session at ~400 system-prompt tokens × 20 turns = 8,000 tokens of unnecessary repeated input.

**Issue**: `retrieveContext()` is keyword-based (no embeddings). It scores paragraphs by query-word overlap. For queries that use different vocabulary than the document (e.g., synonyms, abbreviations), the context returned may be irrelevant. This is the RAG MVP noted in the handoff.

**Issue**: Conversation is saved after streaming completes. If the streaming fails mid-way (controller error), the partial response is NOT saved — the conversation record loses the assistant turn. The user sees partial output in UI but the conversation history is not persisted.

---

### 6. Remediation — `app/api/remediation/route.ts`

**Model**: claude-sonnet-4-5
**Prompt size**: `topicsContent = JSON.stringify(relevantTopics)` — filtered to the weak-topic reviewer entries. Small and appropriate.
**maxTokens**: 2,000
**Caching**: Ephemeral cache on topicsContent. Rarely hits since weak topics vary per attempt.
**Streaming**: No.
**maxDuration**: No `maxDuration` set — same risk as checkpoint-flashcards.
**Zod validation**: Yes — schema determined by `schemaType` from `getRemediationConfig`.
**Method-awareness**: Yes — method-aware schema routing via `getRemediationConfig`. Retrieval-family methods are overridden to feynman for remediation (correct pedagogical decision).

**Issue**: No `maxDuration` set.

**Issue**: The `action === "get"` path (line 36) calls `getLatestRemediationReviewer(documentId)` with no user ownership check. `getLatestRemediationReviewer` in `lib/store.ts` queries `remediation_reviewers` by `document_id` only — no `user_id` column exists on that table. Any authenticated user who knows a `documentId` can retrieve the remediation reviewer.

**Issue**: The `action === "complete"` path (line 103) also reads progression with `getProgression(documentId, user.id)` correctly, but calls `upsertProgression` which does NOT verify the document is owned by this user — it operates purely on the progression record which is linked by document_id.

---

### 7. Open Answer Grading — `app/api/quiz/grade-open/route.ts`

**Model**: claude-sonnet-4-5 (via `generateStructured`) — should be Haiku (AI-4 from handoff).
**Prompt size**: Question + correct answer + variants + user answer — tiny (< 500 chars).
**maxTokens**: 150 — correct.
**Caching**: `documentText: ""` is passed — the empty string is the cache key for the document block. This means the cache layer caches an empty document, which is harmless but wasteful.
**Streaming**: No.
**maxDuration**: No `maxDuration` set.
**Auth check**: None. This route has no `createSupabaseServer()` or `getUser()` call. Any unauthenticated request can call this endpoint. It does not access the DB or modify state, but it does trigger a Claude API call (cost exposure).

**Issue (AI-4)**: Should use Haiku, not Sonnet, for this trivial grading task. Haiku costs ~10× less per token. At scale this is the highest-frequency Claude call (one call per open-answer question submitted).

**Issue**: No auth check — unauthenticated users can trigger Claude API calls freely.

---

### 8. PDF OCR — `lib/claude.ts` `ocrPdfWithVision()`

**Model**: claude-sonnet-4-5
**Input**: Full PDF as base64 — can be very large (25 MB limit). A 25 MB PDF base64-encoded is ~33 MB of string.
**maxTokens**: 16,000 — appropriate.
**Caching**: No caching. Correct — OCR is inherently one-shot.
**Streaming**: No.

---

### 9. Image OCR — `app/api/upload/route.ts` `ocrImageWithVision()`

**Model**: hardcoded `"claude-opus-4-5"` — should use `MODEL` constant (AI-4 applies here too).
**Prompt size**: Full image as base64 + short text prompt.
**maxTokens**: 8,000.
**Caching**: No caching.

---

## Structured Output Reliability

All structured routes validate with Zod after JSON parsing. The error path throws:
```ts
throw new Error(`Claude returned invalid JSON or schema mismatch: ...`)
```
This propagates to the route's catch block and returns a 500 with the raw error message. The raw error is user-visible in the response JSON (`{ "error": "..." }`). For schema mismatch errors, the first 300 chars of Claude's raw output are included. This is useful for debugging but leaks model internals to users.

The multi-schema reviewer (conceptual/retrieval/memory/relational) is more fragile than the standard schema: these schemas require strict field names and values (e.g., `type: "conceptual"` literal, `priority: enum(["HIGH","MEDIUM","LOW"])`). Model output can drift, especially on edge-case documents.

---

## Summary of Issues

| Code | Severity | Issue |
|---|---|---|
| AI-2 | High | Quiz and flashcard routes send uncapped `doc.text` (~50K chars) to Claude |
| AI-4 | High | `grade-open` and `ocrImageWithVision` use Sonnet/Opus instead of Haiku |
| H4 | High | Tutor system prompt not cached — 20-turn sessions pay full input cost 20× |
| — | High | `grade-open` has no auth check — unauthenticated callers can trigger Claude API calls |
| — | Medium | `checkpoint-flashcards` action=get has no user ownership check |
| — | Medium | `remediation` action=get has no user ownership check (no user_id on remediation_reviewers table) |
| — | Medium | Reviewer uses 4K compressed text; quiz/flashcards use full 60K text — inconsistent coverage |
| — | Medium | No `maxDuration` on checkpoint-flashcards, remediation, grade-open routes |
| — | Low | `ocrImageWithVision` creates a new Anthropic client instead of using shared `claude` instance |
| — | Low | Tutor streaming errors leave conversation unsaved — partial turns lost |

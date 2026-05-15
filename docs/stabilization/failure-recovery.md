# Failure Recovery

For each AI generation step: what happens on failure, what state is left, whether the user sees a useful error, whether retry logic exists, and what manual recovery is possible.

---

## 1. Upload Processing Failure

### Scenario A: Text extraction fails (DOCX corrupt, PDF unreadable)
**What happens**: `mammoth.extractRawText()` or `pdfParse()` throws. The outer try/catch at line 183 catches it and returns `{ error: message, status: 500 }`.
**User sees**: A generic error message from the upload zone (the `message` field from the thrown error, e.g., "File format error" or similar mammoth error text).
**State left**: The file is still in `temp-uploads` (orphaned). No document record was created. No DB corruption.
**Retry logic**: None. The client can retry the upload from scratch.
**Manual recovery**: No action needed — the document was never created. The orphaned storage file will accumulate unless manually cleared from the Supabase Storage dashboard.

### Scenario B: OCR fails after text extraction attempt
**What happens**: `ocrPdfWithVision()` or `ocrImageWithVision()` throws (Claude API error, timeout, rate limit).
**For PDFs**: If `extracted.text.length < 200`, returns 422 with a user-facing message. If `extracted.text.length >= 200`, falls back to the extracted text — OCR failure is silently absorbed.
**For images**: Returns 422 with "Could not extract text from image."
**User sees**: 422 = informative error; fallback case = upload succeeds silently with degraded text.
**State left**: No document record on 422. On fallback, document is saved with non-OCR text.
**Manual recovery**: User can retry with a higher-quality image or use a text-based PDF.

### Scenario C: `saveDocument()` fails (DB write error)
**What happens**: Supabase `.upsert()` fails (connection error, constraint violation, etc.). `saveDocument` throws. Outer catch returns 500.
**User sees**: 500 with the DB error message.
**State left**: File is orphaned in `temp-uploads`. No document created. No DB corruption.
**Manual recovery**: User retries upload. Orphaned file needs manual cleanup.

### Scenario D: `saveChunks()` fails after `saveDocument()` succeeds
**What happens**: `saveDocument` succeeds (document record exists). `saveChunks` fails. Outer catch returns 500.
**User sees**: 500 error. The upload appears to have failed.
**State left**: Document record exists in DB but `doc.chunks = null`. The tutor would work (using `doc.text`), but any future chunk-based feature would find no chunks. The user gets a failed upload response and might retry — creating a duplicate document (different ID, same content) because the upload route doesn't check for existing records before saving.
**Manual recovery**: User retries upload, creating a duplicate. Admin can manually delete the orphaned partial record from Supabase.

---

## 2. Reviewer Generation Failure

### Scenario A: Claude API error (network, 5xx, rate limit)
**What happens**: `generateStructured()` propagates the Anthropic SDK error. `reviewer/route.ts` catch block returns `{ error: message, status: 500 }`.
**User sees**: The reviewer UI (in `ReviewerView.tsx`) presumably shows the error from the API response. The user can retry reviewer generation (no `force=true` needed since no reviewer was saved).
**State left**: `doc.reviewer` is unchanged (null or previous value). No corruption.
**Retry logic**: None server-side. The client can re-request immediately.

### Scenario B: Zod validation failure (Claude returns invalid schema)
**What happens**: `schema.parse(JSON.parse(raw))` throws. Error message includes "Claude returned invalid JSON or schema mismatch" and the first 300 chars of the raw response.
**User sees**: 500 with the schema error message — potentially confusing ("schema mismatch" means little to a student).
**State left**: No reviewer saved. Safe to retry.
**Frequency of occurrence**: More likely with adaptive schemas (conceptual/retrieval/memory/relational) which have strict literal types and nested structures. Less likely with the standard `ReviewerSchema`.

### Scenario C: Reviewer generation succeeds but `updateDocument()` fails
**What happens**: Parsed reviewer is valid. `updateDocument(id, userId, { reviewer: parsed })` → `getDocument()` → `saveDocument()`. If either of these DB calls fails, the reviewer is lost (it was never saved). The route returns 500.
**User sees**: 500 error. Reviewer is regenerated on next attempt (which re-runs the full AI call).
**State left**: `doc.reviewer = null`. No corruption. Lost the AI generation cost.

---

## 3. Quiz Generation Failure

### Scenario A: Quiz generation times out (120s maxDuration exceeded)
**What happens**: Vercel terminates the function. The client receives a 504 timeout response.
**User sees**: A generic timeout error. The quiz remains unlocked (since the quiz lock check passed before generation started — the quiz was already unlocked at the time of the call).
**State left**: `doc.quiz` unchanged (null or previous quiz). No corruption. User can retry.
**Retry logic**: None. Client can call again.

### Scenario B: Zod validation failure on `ExtendedQuizSchema`
**What happens**: Claude's JSON fails to match the extended schema (e.g., a question is missing the `type` field, or `correctIndex` is out of range).
**User sees**: 500 with "schema mismatch" error.
**State left**: No quiz saved. Safe to retry.
**Gap**: The `ExtendedQuizSchema` requires per-question `type` discrimination. If Claude generates a malformed question (missing `type`), the entire quiz fails validation — not just the one question. This is all-or-nothing recovery.

---

## 4. Flashcard Generation Failure

Same pattern as quiz generation. 120s timeout, Zod validation failure.
**Additional gap**: If `updateDocument(id, userId, { flashcards: parsed.cards })` fails after successful AI generation, the flashcards are lost. User retries and pays the full AI cost again.

---

## 5. Checkpoint Flashcard Generation Failure

### Scenario A: Claude API error or Zod failure
**What happens**: `generateStructured()` throws. Route catch block returns 500 with the error message.
**User sees**: The checkpoint challenge UI presumably shows an error or stays in loading state. The checkpoint cannot be completed without flashcards.
**State left**: No checkpoint flashcards saved. `cpStatus.flashcardsGenerated` was not set to `true`. The progression was not updated.
**Recovery**: User can retry the generate action. No state corruption.

### Scenario B: `saveCheckpointFlashcards()` succeeds but `upsertProgression()` fails
**What happens**: Flashcards are saved to `checkpoint_flashcards` table. Then `upsertProgression` fails. Route returns 500.
**User sees**: Error. But the flashcards ARE saved — so a retry of the generate action would find `existing` cards on the second call and return them without re-generating (the `if (existing && !body.force)` guard).
**State left**: Checkpoint flashcards exist but `cpStatus.flashcardsGenerated = false` still in progression. The next `generate` call returns the existing cards correctly. The progression may not reflect `flashcardsGenerated = true` until the next successful `upsertProgression` call.

---

## 6. Tutor Streaming Failure

### Scenario A: Claude API error mid-stream
**What happens**: The `for await (const chunk of stream)` loop encounters an error. The catch block inside the ReadableStream `start()` function (line 131) catches it and enqueues `{ error: msg }` to the stream, then closes the controller.
**User sees**: Partial response in the chat, then an error message appended to the stream. The error is surfaced inline in the chat.
**State left**: The `saveConversation` call inside the try block is NOT reached (the error threw before it). The user message and partial assistant response are NOT saved to the DB. The conversation reverts to the pre-message state on next load.
**Gap**: Lost conversation turn. No retry logic.

### Scenario B: `saveConversation()` fails after full response is collected
**What happens**: The full response was streamed to the user. `saveConversation()` throws. The ReadableStream catch enqueues an error and closes.
**User sees**: The full response was already displayed (streaming is done). Then an error message appears at the end of the stream.
**State left**: The user saw the response but the conversation is not persisted. On page reload, the conversation shows the pre-turn state.
**Gap**: Lost conversation turn after successful streaming. Confusing UX.

---

## 7. Remediation Reviewer Generation Failure

Same pattern as reviewer generation. If Claude fails, no remediation reviewer is saved. The progression state `remediationActive` remains at its pre-call value (the generate action also sets `remediationActive = true` after generation succeeds — but if generation fails, the catch block returns before reaching the upsertProgression call).

**Gap**: If the progression update succeeds but the remediation save fails (or vice versa), state is inconsistent. The `remediationActive` flag may be set without a corresponding remediation reviewer existing.

---

## 8. Export (DOCX) Failure

### Scenario A: `Packer.toBuffer()` throws (malformed reviewer data)
**What happens**: The DOCX library encounters unexpected data in the reviewer structure. Throws. No error handling — the route does not have a try/catch.
**User sees**: Unhandled promise rejection → Next.js returns a 500 with no informative body.
**Gap**: `export/route.ts` has no try/catch wrapper. Any failure in DOCX building produces an unhandled 500.

### Scenario B: Export with adaptive reviewer schema (silent garbage)
**What happens**: `buildDocx(doc, doc.reviewer as Reviewer)` receives a conceptual/retrieval/memory/relational reviewer cast to `Reviewer`. The function accesses `topic.coreIdea`, `topic.keyPoints`, etc. — which are undefined on adaptive schemas. The DOCX is built with empty/undefined content.
**User sees**: A downloaded DOCX file with empty sections — no error, no warning.
**Gap**: Silent correctness failure. No schema type check before calling `buildDocx`.

---

## Summary Table

| Step | Failure Type | User Sees | State Corrupted? | Retry Safe? |
|---|---|---|---|---|
| Upload → text extraction | Caught 422/500 | Informative error | No | Yes |
| Upload → OCR fails, fallback text | Silent fallback | Upload succeeds with degraded text | No (but degraded) | N/A |
| Upload → DB write fails | 500 | Generic error | No (but orphaned file) | Yes (creates new doc) |
| Reviewer → Claude API error | 500 | Error message | No | Yes |
| Reviewer → Zod validation | 500 | "schema mismatch" — confusing | No | Yes |
| Quiz → Claude timeout | 504 | Gateway timeout | No | Yes |
| Quiz → Zod validation | 500 | "schema mismatch" | No | Yes |
| Checkpoint → generate fails | 500 | Error | No | Yes |
| Checkpoint → DB fails after cards saved | 500 | Error | No (cards exist, flag not set) | Yes (returns existing) |
| Tutor → Claude error mid-stream | Inline error in stream | Partial response + error | Yes (turn not saved) | Yes (new turn) |
| Tutor → saveConversation fails | Inline error appended | Full response visible, then error | Yes (turn not saved) | Yes (new turn) |
| Remediation → generate fails | 500 | Error | Partial (if upsert ran) | Yes |
| Export → buildDocx throws | 500 (unhandled) | Generic 500 | No | Yes |
| Export → adaptive schema mismatch | Silent garbage DOCX | No error | No | N/A |

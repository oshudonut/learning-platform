# Observability Plan

Current logging state and actionable additions. No new infrastructure required — all recommendations use `console.info/error/warn` piped to Vercel's built-in log streaming, plus structured log fields Vercel captures automatically.

---

## What Exists Today

The following `console.info` and `console.error` calls exist:

| Location | Call | Trigger |
|---|---|---|
| `lib/claude.ts` line 6 | `console.warn("[claude] ANTHROPIC_API_KEY not set")` | Module load without API key |
| `app/api/upload/route.ts` line 116 | `console.info("[upload] using Claude OCR for PDF")` | OCR fallback triggered |
| `app/api/upload/route.ts` line 119 | `console.error("[upload] Claude PDF OCR failed:", ocrErr)` | PDF OCR fails |
| `app/api/upload/route.ts` line 143 | `console.error("[upload] image OCR failed:", ocrErr)` | Image OCR fails |
| `app/api/upload/route.ts` line 187 | `console.error("[upload] error:", message)` | Any upload error |
| `app/api/reviewer/route.ts` line 100 | `console.error("[reviewer] error:", message)` | Any reviewer error |
| `app/api/quiz/route.ts` line 74 | `console.error("[quiz] error:", message)` | Any quiz error |
| `app/api/flashcards/route.ts` line 52 | `console.error("[flashcards] error:", message)` | Any flashcard error |
| `app/api/tutor/route.ts` line 151 | `console.error("[tutor] error:", message)` | Outer catch only — streaming errors inside the ReadableStream are NOT logged |

### What's missing
- No structured log fields (no userId, documentId, duration, token counts)
- No success logging for any route
- No token usage logging (cache hit rates, input/output sizes)
- No latency tracking
- Streaming errors inside the tutor ReadableStream controller are not logged at all
- Remediation, checkpoint-flashcards, progression, export, library, grade-open routes have NO error logging

---

## Priority 1: Add Error Logging to Unlogged Routes

These routes have catch blocks that return 500 but log nothing:

- `app/api/remediation/route.ts` — no error log
- `app/api/checkpoint-flashcards/route.ts` — no error log
- `app/api/progression/route.ts` — no error log
- `app/api/export/route.ts` — no try/catch at all
- `app/api/library/route.ts` — no error log in DELETE handler
- `app/api/quiz/grade-open/route.ts` — catch silently returns fallback, no log

**Recommended addition (same pattern for all)**:
```ts
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[route-name] error:", message);
  return NextResponse.json({ error: message }, { status: 500 });
}
```

**For `export/route.ts`**: wrap the entire handler in try/catch (currently missing entirely).

---

## Priority 2: Log Streaming Errors in the Tutor

The tutor's streaming error (inside the ReadableStream `start()` controller) currently enqueues an error to the stream but does not call `console.error`. If the tutor breaks at 2am, there is no server-side log.

**Recommended addition in `app/api/tutor/route.ts` line 133**:
```ts
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[tutor] streaming error:", msg);  // ADD THIS
  controller.enqueue(...);
  controller.close();
}
```

---

## Priority 3: Add Token Usage Logging

`generateStructured()` already returns `{ cacheReadTokens, cacheWriteTokens }`. The reviewer and quiz routes log neither the cache hit rate nor the raw token counts. Without this, there is no visibility into whether the caching is working or what the actual API cost is.

**Recommended addition in routes that call `generateStructured`**:
```ts
console.info("[reviewer] generated", {
  docId: id,
  userId: user.id,
  schemaType,
  cacheReadTokens,
  cacheWriteTokens,
  cached: cacheReadTokens > 0,
});
```

This requires no infrastructure — Vercel logs capture all `console.info` output and they're searchable in the Vercel dashboard.

**Apply to**: reviewer, quiz, flashcards, checkpoint-flashcards, remediation routes.

---

## Priority 4: Log Tutor Message Timing

The tutor is the highest-frequency and most latency-sensitive route. Add duration tracking:

**Recommended addition in `app/api/tutor/route.ts`**:
```ts
const start = Date.now();
// ... stream completes ...
console.info("[tutor] message", {
  userId: user.id,
  docId: documentId ?? null,
  convId,
  durationMs: Date.now() - start,
  responseChars: fullResponse.length,
});
```

---

## Priority 5: Log Upload Processing Results

The upload route already logs OCR events. Add a structured success log after `saveDocument` and `saveChunks`:

**Recommended addition in `app/api/upload/route.ts`** (after line 169):
```ts
console.info("[upload] processed", {
  userId: user.id,
  docId: id,
  filename,
  fileExt,
  ocrUsed,
  textLength: text.length,
  truncated,
  chunkCount: chunks.length,
  pages,
});
```

---

## What to Alert On

If Vercel log-based alerts or external monitoring (e.g., Sentry, Datadog) are added later, prioritize these conditions:

| Condition | Why it matters |
|---|---|
| `[upload] Claude PDF OCR failed` in logs | OCR failure on upload — user gets degraded or no content |
| Any `[*] error:` containing "schema mismatch" | Claude returned invalid JSON — prompt drift, likely needs investigation |
| Any `[*] error:` containing "rate limit" or "429" | Anthropic API rate limit hit — all users blocked |
| HTTP 504s on `/api/reviewer`, `/api/quiz`, `/api/flashcards` | Function timeout — maxDuration exceeded |
| `cacheReadTokens: 0` consistently on reviewer for same doc | Cache misses — compression changing, verify consistency |

---

## What NOT to Add

- Do not add per-question logging in the quiz or per-card logging in flashcards — too verbose.
- Do not log document text or question content — PII/content risk.
- Do not add a custom logging library or log aggregation service at this stage — Vercel's built-in logs are sufficient for a personal tool.
- Do not add request ID tracking or distributed tracing — the single-process model makes request correlation implicit.

---

## Current Vercel Log Access

All `console.*` output is visible in:
- Vercel Dashboard → Project → Functions → select the function
- Vercel CLI: `vercel logs --follow`

Each log line is automatically timestamped and tagged with the function name. For a personal tool at current scale, this is sufficient observability.

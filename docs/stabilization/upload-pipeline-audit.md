# Upload Pipeline Audit

Covers the two-step upload flow: browser → presign → Supabase Storage → process → DB write → temp delete.

---

## Flow Overview

1. Client calls `POST /api/upload/presign` with `{ filename }` — receives a signed upload URL and `storageKey`.
2. Client PUTs the file bytes directly to Supabase Storage using the signed URL (bypasses Vercel's 4.5 MB body limit).
3. Client calls `POST /api/upload` with `{ storageKey, filename, ocr?, reviewerName?, folderId? }`.
4. Server downloads the file from `temp-uploads` bucket, extracts text, writes to DB, then fires a cleanup delete.

---

## Auth Checks

### Presign endpoint (`app/api/upload/presign/route.ts`)
- Uses `createSupabaseServer()` + `supabase.auth.getUser()` — correct SSR-aware auth check.
- Returns 401 if no user. Auth is checked before signing the URL.
- The storage key is namespaced as `${user.id}/${Date.now()}-${safe}` — correct ownership scoping.

### Process endpoint (`app/api/upload/route.ts`)
- Also uses `createSupabaseServer()` + `getUser()` — correct.
- Validates `storageKey.startsWith(user.id + "/")` before downloading (line 73). This prevents one authenticated user from processing a file uploaded by another user.
- Uses the admin Supabase client (`supabase as admin`) for the download — this is service-role level, bypassing RLS. This is intentional (storage RLS only permits service_role per `storage_migration.sql`), but means the storageKey validation on line 73 is the only ownership guard.

---

## File Type Validation

- Validated by file extension in the process route (line 78): `.pdf`, `.docx`, `.png`, `.jpg`, `.jpeg`, `.webp`.
- Extension is derived from the `filename` parameter the client sends — **not from the actual content-type of the stored file**.
- Risk: A user could upload a `.exe` disguised as `.pdf` by passing `filename: "malware.pdf"` but uploading binary content. The presign endpoint sanitizes the filename with `replace(/[^a-zA-Z0-9._-]/g, "_")` but does not validate the extension against an allowlist at presign time.
- The process route does check extension before processing, but by then the file is already in storage.
- **Recommendation**: validate the extension in the presign endpoint before issuing the URL.

---

## Size Limits

- Bucket `fileSizeLimit` is set to 26,214,400 bytes (25 MB) in `presign/route.ts` line 21.
- The storage_migration.sql also sets 26214400 on bucket creation.
- The process route re-checks `fileBytes.byteLength > MAX_BYTES` (25 MB) after downloading (line 95). This is a defense-in-depth check, but adds a full download of a large file before rejecting it. Supabase Storage should reject oversized uploads at upload time given the bucket-level limit.
- The `TEXT_STORE_CAP` is 60,000 characters. Text beyond that is silently truncated before DB write (`storedText = text.length > TEXT_STORE_CAP ? text.slice(0, TEXT_STORE_CAP) : text`, line 148). The full text is still used for chunking (`chunks = chunkText(text)` on line 149, operating on the uncapped `text`). This means chunks are generated from the full text but only the first 60K chars are persisted to `doc.text` — so `doc.text` and `doc.chunks` are inconsistent for long documents.

---

## OCR Fallback

### PDF OCR
- `extractPdfText()` is tried first (pdf-parse). If the result is under 200 characters or `forceOcr` is true, `ocrPdfWithVision()` is called.
- If OCR fails AND the initial extract was under 200 chars, returns 422 with a user-facing error. Correct.
- If OCR fails but the initial extract was usable (>= 200 chars), falls back to the extracted text. This fallback path logs `console.error` but does not surface `ocrUsed = false` vs. the original text — the response returns `ocrUsed: false`, which is accurate.
- The 200-character threshold is a reasonable heuristic but will misfire on extremely short text-based PDFs (e.g., a one-page doc with a 150-character abstract). Those will be unnecessarily OCR'd.

### Image OCR (`ocrImageWithVision`)
- Defined inline in `upload/route.ts` (lines 25–48), using a fresh `new Anthropic()` client rather than the shared `claude` instance from `lib/claude.ts`. This is inconsistent — two Anthropic clients exist in the process. No functional harm but wastes a constructor call and diverges from the shared client's config.
- Uses `claude-opus-4-5` hardcoded at line 29 — the most expensive model, not the shared `MODEL` constant from `lib/claude.ts`. This is an AI-4 issue: image OCR should use the same model constant.
- No prompt caching on the image OCR call — each image pays full input cost.
- `max_tokens: 8000` is appropriate for image OCR.

### PDF Vision OCR (`ocrPdfWithVision` in `lib/claude.ts`)
- Uses `MODEL` (claude-sonnet-4-5) — consistent with the shared constant.
- `MAX_OUTPUT_TOKENS = 16_000` — appropriate for 100 pages of dense text.
- No prompt caching — the PDF base64 is sent fresh each time, but OCR is inherently one-shot so this is acceptable.

---

## Error Paths and Orphaned Files

### The core orphan risk
The temp cleanup is fire-and-forget:
```ts
admin.storage.from(BUCKET).remove([storageKey]).catch(() => {});
```
This is placed at line 172 — AFTER both `saveDocument()` and `saveChunks()` succeed. So the delete only fires if processing succeeds. If processing fails at any point (text extraction fails, DB write fails, Zod validation fails, OCR times out), the function throws into the outer try/catch, which returns a 500. The fire-and-forget cleanup is **never called** on the error path.

**Result**: Any failed upload leaves the temp file orphaned in `temp-uploads` indefinitely. Supabase Storage has no automatic TTL on bucket objects.

### Specific failure scenarios that orphan files
- `mammoth.extractRawText()` throws (corrupt DOCX) → 500 → orphaned file
- `ocrPdfWithVision()` throws (Claude API error/timeout) → 500 → orphaned file
- `saveDocument()` throws (DB error) → 500 → orphaned file
- `saveChunks()` throws → 500 → orphaned file (document was saved, chunks not)

### Mitigation options
1. Move the cleanup to a `finally` block that always runs.
2. Or add a separate cleanup job (cron or storage lifecycle rule) to delete files older than 1 hour from `temp-uploads`.

---

## `createBucket` Idempotency Call

In `presign/route.ts` line 20:
```ts
await admin.storage.createBucket(BUCKET, { ... }).catch(() => {});
```
This is called on every presign request. `createBucket` is idempotent (silently catches the "already exists" error), but it is still an extra round-trip to Supabase on every upload initiation. For a single-user personal tool this is negligible, but at 100+ concurrent uploads it adds latency and unnecessary API calls.

The bucket should be created once via `storage_migration.sql` (which already does this) and the `createBucket` call in the presign route should be removed. The bucket already exists in production.

---

## `maxDuration` Settings

- `presign/route.ts`: no `maxDuration` set — defaults to Vercel's 10-second limit for hobby plans (60s for pro). This is fine for a presign operation.
- `upload/route.ts`: `maxDuration = 60` seconds. For a large PDF going through Claude Vision OCR (which can take 20-40 seconds), this is tight. A 100-page PDF OCR call can consume 30+ seconds. The 60-second limit may cause timeouts on large image-only PDFs.

---

## Summary of Issues

| Severity | Issue |
|---|---|
| High | Orphaned temp files on any processing failure — no cleanup on error path |
| Medium | File extension validated from client-supplied filename, not actual content |
| Medium | `ocrImageWithVision` hardcodes `claude-opus-4-5` instead of using `MODEL` constant |
| Medium | `TEXT_STORE_CAP` and chunking operate on different text lengths — `doc.text` and `doc.chunks` become inconsistent for long documents |
| Medium | `createBucket` called on every presign — wasteful round-trip |
| Low | `maxDuration = 60` for upload route is tight for large OCR jobs |
| Low | No file extension validation in presign endpoint |
| Low | `ocrImageWithVision` creates a new Anthropic client instead of using shared `claude` instance |

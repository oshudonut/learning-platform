---
name: project-chunking-pipeline
description: Pre-computed text chunking added at upload time — chunk strategy, storage shape, and text cap decisions for the PDF pipeline
metadata:
  type: project
---

Pre-computed chunks are stored on the Document record at upload time, not at AI generation time.

**Why:** The previous design sent the full raw PDF text to Claude on every AI call. Chunking at upload gives downstream AI routes the ability to retrieve only relevant slices, reducing token spend and latency.

**How to apply:** Any route that previously read `doc.text` and passed it wholesale to Claude should switch to calling `getChunks(docId)` from `lib/store.ts` and selecting the relevant chunks instead.

## Implementation details

- `chunkText(text: string): TextChunk[]` lives in `lib/pdf.ts`
- Strategy: 400-word chunks with a 50-word overlap window
- Overlap ensures sentences that span a boundary appear fully in at least one chunk
- Words (not bytes/chars) are used as the unit because PDF text can be multi-byte unicode

## Text cap on Document.text

- `Document.text` is capped at 60,000 characters (`TEXT_STORE_CAP` in the upload route)
- `textLength` still records the true full length for display purposes
- Chunks are built from the full extracted text *before* the cap, so they cover the entire document even when `text` is truncated

## Storage shape

`TextChunk` (in `lib/types.ts`):
```ts
{ index: number; content: string; wordCount: number }
```

Stored as `chunks?: TextChunk[]` on the `Document` type and persisted inside the document's `.data/<id>.json` file via `saveChunks` / `getChunks` in `lib/store.ts`.

## Upload flow order (important)

1. `saveDocument(...)` — must come first so the record exists
2. `saveChunks(id, chunks)` — resolves the document by id; will throw if called before saveDocument

## Upload route response shape (post-change)

The upload route now includes `chunkCount` in its JSON response alongside the existing `textLength`, `pages`, `truncated`, `ocrUsed` fields.

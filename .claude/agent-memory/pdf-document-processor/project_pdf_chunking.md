---
name: project-pdf-chunking
description: Smart chunking functions added to lib/pdf.ts to reduce token waste in the upload pipeline
metadata:
  type: project
---

`chunkText` and `extractSummarySlice` were added to `/Users/davecardona/learning-platform/lib/pdf.ts`.

**Why:** The previous pipeline sent up to 200,000 chars of raw PDF text to Claude for every reviewer/quiz/flashcard generation — wasteful and expensive. The new functions allow callers to either chunk the full text for retrieval or extract a dense 40,000-char slice for single-shot AI generation.

**How to apply:** When working on any feature that calls Claude with document text, prefer `extractSummarySlice` for single-pass generation tasks (reviewer, quiz, flashcard) and `chunkText` for retrieval-augmented flows.

Key design decisions:
- `TextChunk` shape (`{ index, content, wordCount }`) is defined in `lib/types.ts` and imported by `pdf.ts` — do not redefine it locally.
- `chunkText` defaults: 800 words target, 100-word overlap. Overlap is clamped to `targetWords - 1` to prevent infinite loops.
- `extractSummarySlice` removes TOC lines, page-number lines, and everything after a References/Bibliography heading before scoring. Uses a two-pointer sliding window over density-scored paragraphs to pick the best contiguous block within the char budget.
- Whitespace normalisation (`cleanWhitespace`) is applied inside `chunkText` but NOT inside `extractSummarySlice` (which does its own paragraph-join step).
- `extractPdfText` was kept byte-for-byte identical — only the two new exports were added.

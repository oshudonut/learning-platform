# Thesis Readiness Evaluation

Evaluates whether the current platform can reliably ingest and process a full thesis (50-150 pages, 50K-200K+ tokens of text).

---

## What "Thesis Intelligence" Means

A full thesis is 50-150 pages of dense academic text. Key characteristics:
- Raw text length: 50,000 to 200,000+ characters after extraction
- Structure: Abstract, introduction, multiple chapters, methodology, results, discussion, bibliography
- Content: Technical terminology, equations (often as images), tables, citations, footnotes
- Typical PDF format: Mix of text-based and image-rendered content

---

## 1. Upload Pipeline — Can it Handle a Thesis?

### File size
- 25 MB limit (`MAX_BYTES` in upload route) — a 150-page research thesis PDF is typically 2-10 MB. **Passes.**
- A thesis with embedded high-resolution figures can reach 30-50 MB — would be rejected by the 25 MB limit. **Partial fail.**

### Text extraction
- `extractPdfText()` in `lib/pdf.ts` uses `pdf-parse` with a `MAX_CHARS = 200,000` cap. A 150-page thesis at ~1,000 words/page × 5 chars/word = 750,000 chars — **heavily truncated** to the first 200,000 chars (roughly the first 40 pages). The rest of the document is silently discarded.
- `truncated: true` is returned in the response and displayed to the user. But the user may not understand that 73% of their thesis was not processed.
- **Verdict**: Text extraction is fundamentally broken for thesis-scale documents at current caps. The last chapter (often where conclusions live) is always dropped.

### Text storage (`TEXT_STORE_CAP = 60,000`)
- Even if `pdf.ts` extracted up to 200K chars, the upload route truncates further to 60,000 chars before saving to `doc.text`. This means only 8-12 pages of a 150-page thesis are stored in the database field used by most AI generation routes.
- **Verdict**: Critical failure. `doc.text` is useless for thesis-scale content.

### Chunking
- `chunkText(text)` operates on the uncapped `text` variable (before the 60K cap). For a 200K-char document: `200,000 / (800 words × 5 chars) = 50 chunks`. The chunk array is stored in `doc.chunks` as JSON.
- A 50-chunk JSONB array at ~4KB each = ~200KB. Postgres JSONB stores this inline in the `documents` row. No separate chunks table — the entire chunks array is loaded whenever the document row is fetched. `listDocuments` fetches the `chunks` column. For a library with 5 thesis documents, the library page loads 1MB+ of chunk data.
- **Verdict**: Chunking itself works, but chunks are stored as JSONB in the document row (a design limitation documented in H6). This does not scale.

### OCR for thesis
- A 150-page scanned thesis sent through `ocrPdfWithVision()` processes only the first 100 pages (per the system prompt: "If the document has more than 100 pages, extract only the first 100 pages"). Output is capped at 16,000 output tokens ≈ 12,000 words ≈ ~20-30 pages of dense text.
- **Verdict**: OCR is unsuitable for full-thesis processing. At most captures ~30 pages of a 150-page thesis.

---

## 2. Reviewer Generation — Does It Work at Thesis Scale?

- `compressDocumentForReview(doc.text, maxChars=4000)` compresses from `doc.text` (already truncated to 60K chars). The review input is 4,000 chars ≈ first 3-4 pages of the thesis.
- The reviewer would reflect only the introduction/background section — missing methodology, results, and discussion entirely.
- `ReviewerSchema.min(3).max(6)` requires 3-6 topics. A thesis has 10-15 conceptually distinct topics across chapters. The reviewer cannot represent a thesis at its natural granularity.
- **Verdict**: Reviewer generation produces a shallow summary of the thesis introduction, not the full thesis. Structurally broken.

---

## 3. Chunking for Tutor RAG — Does It Scale?

- `retrieveContext(doc.text, message, maxChars=3000)` performs keyword-based retrieval over `doc.text`. For a thesis, `doc.text` contains only the first 60K chars (introduction + early chapters). Questions about methodology, results, or conclusions receive context from the wrong part of the document.
- The `doc.chunks` array could provide full coverage, but the tutor route currently uses `doc.text`, not `doc.chunks`. The chunk array is completely unused by the tutor.
- For thesis-scale RAG to work, the tutor must switch from `retrieveContext(doc.text, ...)` to chunk-based retrieval:
  1. Load `doc.chunks` (separate query or included in document fetch).
  2. Score chunks by keyword overlap (same algorithm, applied to chunks instead of paragraphs within `doc.text`).
  3. Concatenate the top N chunks up to `maxChars`.
- **Verdict**: The chunk infrastructure exists but is not wired to the tutor. Tutor RAG is broken for thesis-scale content until the tutor switches to chunk-based retrieval.

---

## 4. Database Schema — Can It Store a Thesis?

### `documents.text` (TEXT column)
- PostgreSQL TEXT has no length limit. Storing 200K chars is fine at the DB level.
- The 60K cap is a code-level limit, not a schema limit. **Schema is fine; code limit must change.**

### `documents.chunks` (JSONB column)
- 50 chunks × ~4KB each = 200KB JSONB inline in the documents row. PostgreSQL TOAST will compress and store this out-of-line automatically for large values, so storage is not a problem.
- However, fetching the full document row (for reviewer/quiz/flashcard generation) now involves deserializing 200KB of JSONB. This is slow but not a blocker at single-user scale.
- **Verdict**: Works but is architecturally wrong. Chunks should be a separate table with individual rows for proper indexing and selective loading.

### `document_progressions`
- `section_statuses` JSONB array: for a thesis with 15 topics, 15 status entries. Fine.
- Fixed 5 checkpoints regardless of section count. For 15 topics, 5 checkpoints at 20% each = checkpoints trigger at sections 3, 6, 9, 12, 15. This works, but checkpoint coverage gaps increase with more sections (some checkpoints cover 3 topics instead of 1-2).

### `reviewer_topics` table
- Does not exist yet (DB-5 from handoff). Thesis reviewer topics need a dedicated table to allow quiz generation to be constrained to reviewer topics. For a thesis, this is critical — without it, the quiz generates from the full (truncated) `doc.text` rather than the reviewed topics.

---

## 5. Quiz and Flashcard Generation at Thesis Scale

- Both send `doc.text` to Claude (60K chars cap) — only the first 8-12 pages of a 150-page thesis.
- Questions would cover only the introduction, not the substantive research.
- **Verdict**: Broken. Useless for thesis assessment.

---

## 6. Summary: What Must Be Fixed Before Thesis Documents Work

| Fix | Priority | Effort |
|---|---|---|
| Raise `MAX_CHARS` in `lib/pdf.ts` from 200K to 400K | Critical | S |
| Raise `TEXT_STORE_CAP` in upload route from 60K to 200K | Critical | S |
| Cap quiz/flashcard generation with `extractSummarySlice()` instead of raw `doc.text` | Critical | S |
| Wire tutor RAG to `doc.chunks` instead of `doc.text` | Critical | M |
| Chunk-based context retrieval (replace `retrieveContext` with chunk scorer) | Critical | M |
| Create `reviewer_topics` table; write topics after reviewer generation | High | M |
| Support reviewer generation in multiple passes (per chapter) for very long documents | High | L |
| Add thesis-specific chunking strategy (respect chapter boundaries as chunk boundaries) | Medium | M |
| Move chunks to a separate `document_chunks` table | Medium | L |
| Handle figure-heavy PDFs (images embedded in thesis) with selective OCR | Low | L |

**Bottom line**: The platform cannot reliably process a thesis today. The two critical blockers are the `TEXT_STORE_CAP` (only first 12 pages stored) and the tutor using `doc.text` instead of chunks. These two fixes alone would make thesis ingestion and tutoring functional. The reviewer/quiz still need per-chapter generation or summary-slice capping to be useful at thesis scale.

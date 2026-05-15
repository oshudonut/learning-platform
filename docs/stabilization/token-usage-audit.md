# Token Usage Audit

Every Claude API call in the codebase, with estimated token counts, model choices, and caching status.

---

## Pricing Reference (as of May 2026)

Claude Sonnet 4.5 (used as `claude-sonnet-4-5` = `MODEL`/`TUTOR_MODEL`):
- Input: ~$3.00/MTok
- Output: ~$15.00/MTok
- Cache write: ~$3.75/MTok
- Cache read: ~$0.30/MTok

Claude Haiku 3.5 (not currently used, recommended for grading):
- Input: ~$0.80/MTok
- Output: ~$4.00/MTok

Claude Opus 4.5 (used only in `ocrImageWithVision`):
- Input: ~$15.00/MTok
- Output: ~$75.00/MTok

---

## Call Inventory

### 1. Reviewer Generation
**Route**: `POST /api/reviewer`
**Model**: claude-sonnet-4-5
**Frequency**: Once per document (cached on `doc.reviewer`; force=true is rare)
**Input tokens**:
- System preamble (~120 tokens) + compressed document text (4,000 chars ≈ 1,000 tokens) = ~1,120
- Task instruction (varies by method/mode; ~500-1,500 tokens for adaptive reviewers)
- Total input: ~1,600–2,600 tokens
**Output tokens**: ~2,000–4,000 (standard schema); up to 6,000 (adaptive schemas with maxTokens=12,000)
**Cache**: Document text block marked ephemeral. First call = cache write (~$0.005 per call). Subsequent calls on same doc = cache read.
**Per-document cost**: ~$0.01–0.02 (uncached), ~$0.001 (cached read)

---

### 2. Quiz Generation
**Route**: `POST /api/quiz`
**Model**: claude-sonnet-4-5
**Frequency**: Once per document per difficulty level (cached; force=true possible)
**Input tokens**:
- System preamble (~120 tokens) + full `doc.text` (up to 60,000 chars ≈ 15,000 tokens)
- Task instruction (~400 tokens with method-aware instructions)
- Total input: **~15,500 tokens** — this is the largest non-OCR input
**Output tokens**: ~2,500–4,000 (10 questions × 250 tokens each avg)
**Cache**: Document text block marked ephemeral. Cache key differs from reviewer (compressed vs full text) — no cross-route cache hit.
**Per-generation cost**: ~$0.047 input + ~$0.045 output = **~$0.09 per quiz generation** (uncached)
**Cache read cost**: ~$0.005 (if same doc text hits cache on retry/regeneration)

---

### 3. Flashcard Generation
**Route**: `POST /api/flashcards`
**Model**: claude-sonnet-4-5
**Frequency**: Once per document (cached; force=true possible)
**Input tokens**: Same as quiz — full `doc.text` up to 15,000 tokens + preamble + task (~200 tokens)
**Output tokens**: ~3,000–5,000 (20 cards × 150-250 tokens each)
**Cache**: Ephemeral on doc text — same cache key as quiz (both use full `doc.text` + `SYSTEM_PREAMBLE`). These two calls CAN share cache if run in the same session.
**Per-generation cost**: ~$0.047 input + ~$0.060 output = **~$0.11 per flashcard generation** (uncached)

---

### 4. Checkpoint Flashcard Generation
**Route**: `POST /api/checkpoint-flashcards` (action=generate)
**Model**: claude-sonnet-4-5
**Frequency**: Up to 5 times per document (one per checkpoint); each cached after first generation
**Input tokens**:
- System preamble (~120 tokens) + `JSON.stringify(coveredTopics)` (~500-2,000 tokens depending on topic count and content size)
- Task instruction (~300 tokens)
- Total input: ~920–2,420 tokens
**Output tokens**: ~800–1,200 (5–8 cards × 150 tokens each, maxTokens=1,500)
**Cache**: Ephemeral on topic JSON — cache rarely hits across calls since topics differ per checkpoint.
**Per-checkpoint cost**: ~$0.007–0.014 input + ~$0.012–0.018 output = **~$0.02–0.03 per checkpoint**
**Total for all 5 checkpoints**: ~$0.10–0.15

---

### 5. Tutor Chat
**Route**: `POST /api/tutor`
**Model**: claude-sonnet-4-5
**Frequency**: Every message sent — this is the HIGHEST-FREQUENCY call
**Input tokens per turn**:
- System prompt: `TUTOR_SYSTEM` (~350 tokens) + method addendum (~100-250 tokens) + `TUTOR_WITH_CONTEXT` wrapper (~80 tokens) + retrieved context (3,000 chars ≈ 750 tokens)
- Total system: **~1,280–1,430 tokens**
- Message history: up to 20 turns × ~100 tokens avg = up to 2,000 tokens
- New user message: ~50 tokens avg
- Total input per turn: **~3,330–3,480 tokens**
**Output tokens**: up to 1,500 (maxTokens setting)
**Cache**: Not cached. System prompt changes per document (context), so even with caching it would miss across different documents. However, the static portion (TUTOR_SYSTEM + method addendum) COULD be cached — the `TUTOR_WITH_CONTEXT` variable part would be a separate uncached block.
**Per-turn cost (no cache)**: ~$0.010 input + ~$0.022 output = **~$0.032 per tutor message**
**20-turn session cost**: ~$0.64

---

### 6. Open Answer Grading
**Route**: `POST /api/quiz/grade-open`
**Model**: claude-sonnet-4-5 (should be Haiku)
**Frequency**: Once per identification/fill-in-the-blank question answered — potentially 4-6 times per quiz attempt
**Input tokens**:
- System preamble (~120 tokens) + empty document block (0 useful tokens, but block still charged) + grading task (~150 tokens)
- Total: ~270 tokens
**Output tokens**: ~30-50 tokens (short JSON: `{ correct, confidence, feedback }`)
**Cache**: Empty `documentText` string is the cached block — effectively wastes a cache slot.
**Per-grade cost on Sonnet**: ~$0.001 input + ~$0.001 output = **~$0.002 per grade**
**Per-grade cost on Haiku**: ~$0.0002 — 10× cheaper
**Per quiz attempt with 4 open questions**: ~$0.008 on Sonnet vs $0.0008 on Haiku

---

### 7. Remediation Reviewer Generation
**Route**: `POST /api/remediation` (action=generate)
**Model**: claude-sonnet-4-5
**Frequency**: Once per failed quiz attempt (cached after generation)
**Input tokens**:
- System preamble (~120 tokens) + weak topic JSON (~300-800 tokens)
- Remediation preamble + task instruction (~400-600 tokens)
- Total: ~820–1,520 tokens
**Output tokens**: ~1,000–2,000 (small reviewer, maxTokens=2,000)
**Per-generation cost**: **~$0.005–0.015**

---

### 8. PDF OCR — `ocrPdfWithVision()`
**Route**: Called from `POST /api/upload`
**Model**: claude-sonnet-4-5
**Frequency**: Only for scanned PDFs (text < 200 chars) or when `forceOcr=true`
**Input tokens**: The PDF document block consumes tokens based on page count. Anthropic bills PDFs as images — roughly 1,500-2,000 tokens per page. A 50-page scanned PDF = **~75,000-100,000 input tokens**.
**Output tokens**: up to 16,000 (MAX_OUTPUT_TOKENS)
**Per-call cost on large PDFs**: ~$0.225-0.300 input + ~$0.240 output = **~$0.45-0.54 per large PDF OCR**

---

### 9. Image OCR — `ocrImageWithVision()`
**Route**: Called from `POST /api/upload` for PNG/JPG/WEBP
**Model**: claude-opus-4-5 (hardcoded — should be Sonnet or Haiku)
**Input tokens**: Image as base64 — depends on image size/complexity. ~1,500-3,000 tokens for a typical photo of a page.
**Output tokens**: up to 8,000
**Per-call cost on Opus**: ~$0.022–0.045 input + up to $0.600 output = **~$0.65 worst case on Opus**
**Per-call cost on Sonnet**: ~$0.005–0.009 input + up to $0.120 output = **~$0.13 worst case**

---

## Top 3 Cost Hotspots

### Hotspot 1: Quiz and Flashcard Generation — Uncapped Document Text (AI-2)
For a document at `TEXT_STORE_CAP` (60,000 chars ≈ 15,000 tokens), each quiz or flashcard generation costs ~$0.09-0.11 in input tokens alone. A user who force-regenerates both multiple times could easily spend $0.50+ in a single session. Fix: cap document text at 40,000 chars for quiz/flashcard generation, matching the `extractSummarySlice` function already available in `lib/pdf.ts`.

### Hotspot 2: Tutor Chat — Uncached System Prompt (H4)
The tutor is the only feature that charges per user interaction. A 20-turn session costs ~$0.64. If 100 users each average 10 tutor messages/month, that is 1,000 messages × $0.032 = **$32/month** from tutor alone. Caching the static portion of the system prompt (TUTOR_SYSTEM + method addendum, ~500 tokens) at cache-write rate ($3.75/MTok) saves ~$2.70/MTok on reads ($0.30/MTok) — a 10× read savings on those tokens.

### Hotspot 3: PDF OCR on Large Scanned Documents
A user who uploads a 100-page scanned medical textbook triggers a single PDF OCR call costing ~$0.50-1.00. This is unavoidable for scanned content but occurs silently. There is no per-user spend tracking, rate limiting, or pre-flight size warning before OCR is triggered.

---

## Monthly Cost Estimate — 100 Active Users

Assumptions:
- Each user uploads 5 documents/month
- 30% of PDFs require OCR (avg 20 pages each)
- Each user generates reviewer + quiz + flashcards once per document
- 5 checkpoint flashcard sets per document
- 2 quiz attempts per document (1 pass, 1 fail with remediation)
- 10 tutor messages per document
- 2 open-answer grades per quiz attempt

| Call Type | Count/month | Unit Cost | Monthly Total |
|---|---|---|---|
| Reviewer generation | 500 | $0.015 | $7.50 |
| Quiz generation | 500 | $0.09 | $45.00 |
| Flashcard generation | 500 | $0.11 | $55.00 |
| Checkpoint flashcards (5×) | 2,500 | $0.025 | $62.50 |
| Remediation reviewer | 100 | $0.010 | $1.00 |
| Tutor messages | 5,000 | $0.032 | $160.00 |
| Open answer grading | 2,000 | $0.002 | $4.00 |
| PDF OCR (150 calls avg 20p) | 150 | $0.18 | $27.00 |
| Image OCR (50 images, Opus) | 50 | $0.30 | $15.00 |
| **Total** | | | **~$377/month** |

After fixing AI-2 (capping document text, -60% quiz/flashcard input cost) and H4 (tutor caching, -40% tutor input cost) and AI-4 (Haiku for grading, -90% grading cost):
**Estimated post-fix total: ~$240/month** — a ~37% reduction.

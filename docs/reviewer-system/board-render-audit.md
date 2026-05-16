# Board-Exam Renderer Audit

Branch: `feature/board-review-renderer`  
Date: 2026-05-16  
Status: Read-only audit — no code changes.

---

## 1. Current Schema Fields (Standard Reviewer)

Source: `lib/types.ts → ReviewerTopicSchema` + `ReviewerSchema`

```
Per topic:
  coreIdea          string          one-sentence most-testable idea
  keyPoints         string[]        board-framed short phrases
  quickBreakdown    string[]        cause → effect chains (→ arrows)
  mustMemorize      string[]        labeled HIGH-YIELD: / BOARD FAVORITE:
  confusedWith?     { item, distinction }[]   optional distinction pairs
  boardTips         string[]        [TRAP] / [PEARL] / [TRICK] tagged strings
  quickRecall       string[]        board-style clinical scenario questions

Top-level:
  title             string
  summary           string
  globalMustMemorize string[]       cross-topic high-yield facts
  mnemonics         { concept, aid }[]   memory devices with actual aid
```

---

## 2. Field-by-Field Category Mapping

### Must Memorize
- **Schema field**: `mustMemorize[]` (per topic) + `globalMustMemorize[]` (cross-topic)
- **Prompt support**: Explicit. Claude is instructed to label items `HIGH-YIELD:` or `BOARD FAVORITE:`, include formulas, thresholds, cutoffs, board-tested definitions.
- **Renderer**: `BoardExamCallout` amber variant, numbered list, `formatBoardText` styling (highlights numeric values, arrows)
- **Gap**: None. Fully supported end-to-end.

---

### Key Concepts
- **Schema field**: `keyPoints[]` + `coreIdea` (string)
- **Prompt support**: Explicit. `coreIdea` = "one sentence, what a board question would test." `keyPoints` = "most commonly", "board favorite", "distinguishing feature", "first-line" framing.
- **Renderer**: `coreIdea` → amber left-border banner (full width, always first). `keyPoints` → `BoardExamCallout` muted, bullet list.
- **Gap**: None. Fully supported.

---

### Diagnostics
- **Schema field**: None dedicated. Diagnostic criteria scatter across `keyPoints`, `mustMemorize`, and `boardTips` depending on how Claude interprets the content.
- **Prompt support**: Implicit only. `REVIEWER_TASK` does not instruct Claude to segregate or label diagnostic criteria. A "diagnosis of hypertension = SBP ≥130" may land in `mustMemorize` (if treated as a threshold), `keyPoints` (if treated as a distinguishing feature), or `boardTips [PEARL]` (if framed as a clinical clue).
- **Renderer**: No dedicated render block. Diagnostics render as generic text inside whichever callout they land in.
- **Gap**: **Medium.** Data is produced but not reliably located or visually differentiated.
- **Fix without schema change**: Add prompt instruction to label diagnostic criteria in `mustMemorize` with a `DX:` prefix (e.g., `"DX: FBS ≥126 mg/dL on two occasions"`). Renderer parses `DX:` prefix and renders a distinct badge. Old data (no prefix) renders unchanged.

---

### Treatments
- **Schema field**: None dedicated. Treatment content lands in `keyPoints` ("first-line: X"), `mustMemorize` ("first-line drug for Y is Z"), or `boardTips [PEARL]`.
- **Prompt support**: Implicit. `REVIEWER_TASK` says "first-line" framing is encouraged in `keyPoints` and `mustMemorize`, but "treatment" is not a named semantic category.
- **Renderer**: No dedicated render block.
- **Gap**: **Medium.** Treatment data is present in output but indistinguishable from other key points visually.
- **Fix without schema change**: Add prompt instruction to label treatment items in `mustMemorize` with `TX:` prefix (e.g., `"TX: Metformin is first-line for T2DM"`). Renderer parses `TX:` and renders a distinct badge.

---

### Symptoms
- **Schema field**: None dedicated. Signs and symptoms scatter across `keyPoints`, `quickBreakdown`, and `coreIdea`.
- **Prompt support**: Implicit. No instruction to segregate symptom data.
- **Renderer**: No dedicated render block.
- **Gap**: **Medium.** Symptom clusters are critical for PNLE/NCLEX (clinical presentation → diagnosis questions), but no reliable location exists in the current output.
- **Fix without schema change**: Add prompt instruction to label symptom items in `keyPoints` with `S/S:` prefix (e.g., `"S/S: fever, night sweats, weight loss — classic B symptoms"`) and in `mustMemorize` for high-yield presentations. Renderer applies a color badge.

---

### Radiographic Findings
- **Schema field**: None dedicated.
- **Prompt support**: Not mentioned. Imaging findings are not called out in `REVIEWER_TASK`, `SYSTEM_PREAMBLE`, or `MODE_INSTRUCTIONS`.
- **Renderer**: No dedicated render block.
- **Gap**: **Low-Medium.** Domain-specific — only relevant for topics with imaging (chest X-ray, ECG, CT findings). For math, law, or non-clinical content this is irrelevant. When present in source material, Claude may or may not surface these in `mustMemorize` or `boardTips`.
- **Fix without schema change**: Add conditional prompt instruction for clinical content: label imaging findings in `mustMemorize` with `IMAGING:` prefix (e.g., `"IMAGING: CXR shows bilateral fluffy infiltrates → ARDS"`). Renderer parses prefix and renders an imaging badge. This is backwards-compatible — only appears when Claude produces it.

---

### Mnemonics
- **Schema field**: `mnemonics[]` at top level — `{ concept: string, aid: string }`. NOT per-topic.
- **Prompt support**: Explicit. 3–6 mnemonics, must include actual device (acronym spelled letter-by-letter, actual rhyme, or vivid image). Validated by `MnemonicSchema`.
- **Renderer**: `MnemonicCard` grid — rendered only on the **last section** (`isLastSection` prop). Users on section 2 of 5 cannot see the mnemonic for that section's content.
- **Gap**: **Medium — location problem, not data problem.** Mnemonic data is rich and well-formed. The problem is that mnemonics are globally stored (not linked to specific topics) and only surfaced at the end of the reviewer. A student studying Beta-Blockers (topic 1) cannot see the Beta-Blocker mnemonic until they reach the last topic.
- **Fix without schema change**: In `BoardExamTopicRenderer`, filter `mnemonics` by matching `mnemonic.concept` to topic content (topic title, keywords in keyPoints/mustMemorize). Show matched mnemonics inline within each section. Continue showing all mnemonics on the last section as a global summary. No prompt or schema change needed.

---

### Distinctions / Confusions
- **Schema field**: `confusedWith[]` — `{ item: string, distinction: string }[]` — **optional** at Zod level.
- **Prompt support**: Explicit. "Include whenever a genuine confusion pair exists — 1–3 pairs per topic." Instructed in both `REVIEWER_TASK` and `MODE_INSTRUCTIONS.board_exam`.
- **Renderer**: `DiffTable` — full-width red/green two-column comparison grid. Renders only when `confusedWith` is present.
- **Gap**: **Low.** The field is optional in Zod, so old cached reviewers may not have it. Current prompt actively encourages it but cannot guarantee it. Renderer handles presence/absence gracefully.
- **No action needed** for the renderer. Could strengthen the prompt further for clinical topics but this is a prompt-quality concern, not an architecture gap.

---

### Complications
- **Schema field**: None dedicated. Complications appear in `boardTips [TRAP]` ("trap: most common complication is X not Y") or `mustMemorize` for high-yield thresholds.
- **Prompt support**: Partially implicit. `[TRAP]` tags in `boardTips` are the natural home for complication traps, but complications as a semantic category are not called out in the prompt.
- **Renderer**: `BoardTipStrip` renders `[TRAP]` tips in red badges, which incidentally catches many complications phrased as traps. But a standalone "complication" item in `mustMemorize` has no visual differentiation.
- **Gap**: **Medium.** Boards heavily test complications ("most serious complication of X", "earliest sign of Y complication"). These facts are critical but unstructured in current output.
- **Fix without schema change**: Add prompt instruction to label major complications in `mustMemorize` with `COMPLICATION:` prefix (e.g., `"COMPLICATION: Most feared = agranulocytosis (clozapine)"`). Renderer parses this prefix and renders a red/danger badge. Also strengthen the prompt to funnel complication traps into `boardTips [TRAP]`.

---

## 3. Gap Summary Table

| Category | Schema Field | Prompt | Renderer | Gap Level | Fix |
|---|---|---|---|---|---|
| Must Memorize | `mustMemorize[]` + `globalMustMemorize[]` | ✓ Explicit | ✓ Amber callout | **None** | — |
| Key Concepts | `keyPoints[]` + `coreIdea` | ✓ Explicit | ✓ Muted callout + banner | **None** | — |
| Diagnostics | None — scatters to `mustMemorize`/`keyPoints` | ✗ Implicit | ✗ None | **Medium** | `DX:` prefix label in prompt + badge in renderer |
| Treatments | None — scatters to `keyPoints`/`mustMemorize` | ✗ Implicit | ✗ None | **Medium** | `TX:` prefix label + badge |
| Symptoms | None — scatters to `keyPoints`/`quickBreakdown` | ✗ Implicit | ✗ None | **Medium** | `S/S:` prefix label + badge |
| Radiographic Findings | None — may appear in `mustMemorize` | ✗ Not mentioned | ✗ None | **Low-Med** | `IMAGING:` prefix label + badge (conditional) |
| Mnemonics | `mnemonics[]` top-level (not per-topic) | ✓ Explicit | ✓ Last section only | **Medium** | Renderer: match by concept → show inline per section |
| Distinctions | `confusedWith[]` optional | ✓ Explicit | ✓ DiffTable | **Low** | None needed; prompt already strong |
| Complications | None — lands in `boardTips [TRAP]` or `mustMemorize` | ✗ Implicit | ✗ Partial (TRAP badge) | **Medium** | `COMPLICATION:` prefix label + badge |

---

## 4. Schema Change Assessment

**Schema change is NOT required for any of the above gaps.**

All 9 categories can be addressed through:

1. **Prompt additions** — prefix-based semantic labeling convention for `mustMemorize` and `keyPoints`:
   - `DX:` — diagnostic criteria
   - `TX:` — treatments / nursing interventions / first-line drugs
   - `S/S:` — signs and symptoms
   - `IMAGING:` — radiographic / ECG / lab findings
   - `COMPLICATION:` — complications and adverse effects

2. **Renderer enhancement** — parse these prefixes in `BoardExamTopicRenderer` and apply color-coded inline badges (similar to how `BoardTipStrip` already parses `[TRAP]`/`[PEARL]`/`[TRICK]`). Text before the prefix renders normally if no prefix is found — so old cached reviewers that lack these labels continue to render without breaking.

3. **Renderer logic change** — topic-scoped mnemonic matching: filter `mnemonics` by topic relevance and show matched mnemonics inline per section.

---

## 5. Proposed Approach (Implementation Order)

### Phase A — Renderer only (no prompt changes, zero regression risk)
1. Mnemonic matching — show relevant mnemonics per section, not just last section
2. Parse clinical prefix labels (`DX:`, `TX:`, `S/S:`, `COMPLICATION:`, `IMAGING:`) in `mustMemorize` and `keyPoints` — render inline color badges when present, plain text when absent

### Phase B — Prompt additions (new documents only, old cached docs unaffected)
3. Add prefix label instructions to `REVIEWER_TASK` and `MODE_INSTRUCTIONS.board_exam`
4. Strengthen complication surfacing: funnel into `boardTips [TRAP]` + `mustMemorize COMPLICATION:`

### Phase C — Consider (only if Phase A/B prove insufficient)
5. Add per-topic structured fields (`diagnostics[]`, `treatments[]`, `symptoms[]`) — only if prefix parsing is too noisy in practice. This would require: Zod schema change, prompt rewrite, renderer rebuild, export update, and DB migration consideration (old reviewer JSON would lack fields and need safe defaults).

**Recommendation: Do Phase A first. It improves rendering for all existing and future documents with zero pipeline risk. Phase B improves new generations only. Phase C is a last resort.**

---

## 6. What Does Not Need to Change

- `lib/types.ts` — `ReviewerSchema`, `ReviewerTopicSchema`, Zod definitions: **untouched**
- `app/api/reviewer/route.ts` — generation, caching, progression reset: **untouched**
- `app/api/progression/route.ts` — all progression logic: **untouched**
- `app/api/export/route.ts` — DOCX export: **untouched** (export reads standard field names as-is)
- `components/reviewer/views/*` — adaptive viewers: **untouched**
- All flashcard, quiz, remediation, tutor code: **untouched**

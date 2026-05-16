# Board-Exam Prompt Upgrade

## Objective

Upgrade `lib/prompts.ts` so the standard reviewer schema consistently produces
output that resembles PNLE review center notes, NCLEX cram sheets, and
high-yield med-school study packets — without changing the schema, renderer,
or progression system.

---

## Pre-Upgrade Audit

### What the renderer expects (and renders)

| Field | Rendered as |
|-------|-------------|
| `coreIdea` | Amber banner strip |
| `keyPoints` | Left-column callout |
| `quickBreakdown` | Left-column callout |
| `mustMemorize` | Right-column amber callout |
| `boardTips` | `BoardTipStrip` — parses `[TRAP]`/`[PEARL]`/`[TRICK]` badges |
| `confusedWith` | `DiffTable` — red/green two-column comparison |
| `quickRecall` | Emerald callout |
| `globalMustMemorize` | Last-section amber callout |
| `mnemonics` | Last-section `MnemonicCard` grid |

### What the old prompt produced

- `boardTips`: Untagged plain text. `BoardTipStrip` defaulted everything to TIP (sky blue). `[TRAP]`/`[PEARL]`/`[TRICK]` badges never appeared because the prompt never instructed Claude to use them.
- `confusedWith`: Marked "optional" — Claude frequently omitted it even when genuine confusion pairs existed.
- `mustMemorize`: Plain facts, no emphasis on high-yield framing or board-exam vocabulary.
- `mnemonics`: Instructed as "2–4 only" with no format requirement — Claude frequently generated vague descriptions instead of actual devices.
- `quickRecall`: Generic recall questions, not board-style vignette phrasing.
- `SYSTEM_PREAMBLE`: Generic academic framing, no PNLE/NCLEX context, no board-exam vocabulary.

---

## Field Mapping for New Semantic Concepts

The user-requested fields (`trapQuestions`, `highYieldFacts`, `clinicalPearls`,
`recallTriggers`) are real educational concepts that already fit into the
existing schema — no new fields needed.

| Requested concept | Maps to existing field | How |
|---|---|---|
| `trapQuestions` | `boardTips` | `[TRAP]` prefix — parsed by `BoardTipStrip` |
| `highYieldFacts` | `mustMemorize` | Label with "HIGH-YIELD:" or "BOARD FAVORITE:" |
| `clinicalPearls` | `boardTips` | `[PEARL]` prefix — parsed by `BoardTipStrip` |
| `recallTriggers` | `quickRecall` | Board-style vignette question phrasing |

This preserves full schema compatibility and costs zero renderer changes.

---

## Changes Made

### 1. `SYSTEM_PREAMBLE`

**Before**: Generic academic exam preparation preamble.

**After**: Explicitly references PNLE, NCLEX, USMLE pattern recognition.
Injects board-exam vocabulary list: "most commonly", "board favorite",
"high-yield", "trap answer", "do not confuse", "clinical clue", "rapid
recall", "most tested". Emphasizes comparison-heavy teaching.

### 2. `REVIEWER_TASK` — field-by-field changes

| Field | Old instruction | New instruction |
|---|---|---|
| `coreIdea` | "ONE sentence — the single most important idea" | Same but now: "what would a board question test from this topic?" |
| `keyPoints` | "short phrases" | Phrases should use "most commonly", "distinguishing feature", "board favorite" framing |
| `mustMemorize` | "high-yield only — formulas, definitions, thresholds" | 2–5 per topic; label with "HIGH-YIELD:" or "BOARD FAVORITE:" where applicable |
| `confusedWith` | "optional — only include when genuine confusion risk exists" | "include whenever a genuine confusion pair exists — 1–3 pairs per topic" |
| `boardTips` | "likely exam trap or shortcut" | 2–4 per topic; MUST use `[TRAP]`/`[PEARL]`/`[TRICK]` prefix tags |
| `quickRecall` | "1–3 active recall prompts" | 2–4 board-style questions; "most tested", clinical scenario framing |
| `globalMustMemorize` | "5–8 cross-topic facts" | 5–10 facts; "thresholds, board favorites, clinical pearls" labeling |
| `mnemonics` | "2–4 only, for genuinely hard-to-remember items" | 3–6; MUST include actual device — spell acronyms letter-by-letter, write the rhyme, describe the image |

### 3. `MODE_INSTRUCTIONS.board_exam`

Strengthened with field-level directives matching the new tag system:
- `mustMemorize` = numerical thresholds, first-line/most-common/most-likely
- `boardTips` = `[TRAP]` for trick choices, `[PEARL]` for clinical clues, `[TRICK]` for shortcuts
- `quickRecall` = clinical scenario style
- `confusedWith` = exam "do not confuse" pairs

---

## Token Impact

| Category | Effect |
|---|---|
| System prompt tokens | ~+15% (richer instructions) |
| Prompt cache | System prompt cached after first call — amortized across all requests for same doc |
| Output tokens | ~+10–20% (richer content per field, more mnemonics) |
| Schema stability | No new fields — Zod parse unchanged |

The instruction density increase is in the system prompt (cached), not the user
content. Net per-query cost increase is small.

---

## JSON Stability

No schema changes. The `ReviewerTopicSchema` Zod definition is untouched:
- `boardTips: z.array(z.string())` — `[TRAP] text` is a valid string
- `mustMemorize: z.array(z.string())` — "HIGH-YIELD: ..." is a valid string
- `confusedWith` remains `optional()` at the Zod level but the prompt now
  actively encourages population
- `mnemonics: z.array(MnemonicSchema)` — unchanged

Parser will not throw on any of the new format conventions.

---

## Methodology Preservation

All 13 learning methods remain intact. The `buildAdaptiveReviewerTask` function
composes `METHOD_INSTRUCTIONS[method]` + `MODE_INSTRUCTIONS[mode]` + the upgraded
`REVIEWER_TASK` — so every method automatically inherits the richer field instructions.

Non-standard schema methods (conceptual, retrieval, memory, relational) are
**not affected** — they use their own `build*Task` functions, which are unchanged.

---

## Files Changed

- `lib/prompts.ts` — `SYSTEM_PREAMBLE`, `REVIEWER_TASK`, `MODE_INSTRUCTIONS.board_exam`

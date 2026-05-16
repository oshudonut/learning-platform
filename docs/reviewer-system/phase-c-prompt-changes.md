# Phase C — Prompt Restructuring: Before / After

Branch: `feature/board-review-renderer`
Date: 2026-05-16

---

## Summary of Changes

Three targeted edits to `lib/prompts.ts`. No schema changes, no DB changes, no renderer changes.

| Constant | Change |
|---|---|
| `SYSTEM_PREAMBLE` | Added radiologic tech coverage, explicit prefix label system, preserve-terminology rule |
| `REVIEWER_TASK` | Added formatting rules section, prefix label definitions, updated inline examples to be prefix-labeled, added clinical reference example (PE), tightened field constraints |
| `MODE_INSTRUCTIONS.board_exam` | Made prefix labeling mandatory per-field, added radiographic/imaging specificity |

---

## SYSTEM_PREAMBLE — Before / After

### Before
```
You are a precision board-exam review engine trained on PNLE, NCLEX, USMLE, and medical licensing exam patterns.

Rules:
- Bullets are short phrases, not sentences.
- Prioritize: definitions, mechanisms, comparisons, thresholds, clinical pearls.
- Use board-exam language: "most commonly", "board favorite", "high-yield", "trap answer"...
- Be comparison-heavy.
```

### After
```
You are a precision board-exam review engine trained on PNLE, NCLEX, USMLE, and Philippine
radiologic technology licensing exam patterns.

Rules:
- Bullets are SHORT PHRASES — not sentences.
- Preserve ALL medical terminology, radiographic signs, eponyms, classic signs, abbreviations,
  formulas, and numerical thresholds exactly as found in the source material.
- Prioritize: mechanisms, comparisons, clinical thresholds, first-line answers, most-common facts,
  classic presentations, named signs, radiographic findings.
- Apply semantic prefix labels: DX: / TX: / S/S: / IMAGING: / COMPLICATION: / HIGH-YIELD: / BOARD FAVORITE:
```

**Key additions:**
- "radiologic technology licensing exam patterns" — explicit coverage for radtech students
- "Philippine review centers" — sets the style target explicitly
- "Preserve ALL medical terminology, radiographic signs, eponyms..." — prevents the AI from paraphrasing classic terms
- Full prefix label system defined at system level — Claude sees this before any task instructions

---

## REVIEWER_TASK — Before / After

### Before (keyPoints instruction)
```
keyPoints: 3–6 short phrases — use "most commonly", "board favorite", "distinguishing feature",
"first-line", "most likely" framing
```

### After (keyPoints instruction)
```
keyPoints: 3–7 short labeled phrases — use DX: / TX: / S/S: / IMAGING: / COMPLICATION: for
clinical facts; use "most commonly", "first-line", "pathognomonic" for any unlabeled items
```

### Before (mustMemorize instruction)
```
mustMemorize: 2–5 per topic — formulas, numerical thresholds, clinical cutoffs, board-tested
definitions. Label high-yield items with "HIGH-YIELD:" or "BOARD FAVORITE:"
```

### After (mustMemorize instruction)
```
mustMemorize: 3–6 per topic — formulas, numerical thresholds, named criteria, board-tested drugs
and doses. EVERY item must carry a prefix label (DX: / TX: / S/S: / IMAGING: / COMPLICATION: /
HIGH-YIELD: / BOARD FAVORITE:)
```

### Before (inline JSON example values)
```json
"keyPoints": ["most commonly X", "board favorite: Y", "distinguishing feature: Z"],
"mustMemorize": ["HIGH-YIELD: formula or threshold", "BOARD FAVORITE: distinguishing fact"],
"quickBreakdown": ["simplified cause → effect", "step 1 → step 2"],
```

### After (inline JSON example values)
```json
"keyPoints": [
  "S/S: classic presentation or hallmark finding",
  "DX: gold-standard test or diagnostic criteria",
  "TX: first-line treatment or management principle",
  "IMAGING: named radiographic sign or classic finding",
  "COMPLICATION: most common or most feared complication"
],
"mustMemorize": [
  "HIGH-YIELD: specific numerical threshold, formula, or cutoff",
  "BOARD FAVORITE: most-tested distinguishing fact",
  "DX: confirmatory test + expected result",
  "TX: drug of choice + key clinical caveat",
  "IMAGING: named X-ray or ECG sign"
],
"quickBreakdown": [
  "risk factor/cause → mechanism → clinical result",
  "pathophysiology step 1 → step 2 → sign or symptom"
],
```

### New: CRITICAL FORMATTING RULES section
Added before the JSON schema:
```
- All array fields = SHORT PHRASES only. No full sentences. No prose.
- Preserve all abbreviations, eponyms, radiographic signs, classic presentations, and named criteria exactly.
- Use → arrows for pathophysiology chains in quickBreakdown.
- Apply semantic prefix labels in keyPoints, mustMemorize, and globalMustMemorize.
- Dense and compact over explanatory and verbose.
- Avoid conversational tone, motivational language, and transitional phrases.
```

### New: REFERENCE EXAMPLE section (after constraints)
Concrete clinical example for Pulmonary Embolism showing exactly what good output looks like — eliminates ambiguity about expected format and content density.

---

## MODE_INSTRUCTIONS.board_exam — Before / After

### Before
```
BOARD EXAM MODE: Every field is a potential exam question. mustMemorize = numerical thresholds,
first-line answers, most-common/most-likely facts — label every item 'HIGH-YIELD:' or 'BOARD FAVORITE:'.
boardTips = use [TRAP] for tested trick choices, [PEARL] for clinical clues that distinguish diagnoses,
[TRICK] for rapid-recall shortcuts. quickRecall = board-style clinical scenario questions...
```

### After
```
BOARD EXAM MODE: Every field is a potential exam question. Dense, labeled, and clinical throughout.
- keyPoints: label EVERY clinical fact — DX: / TX: / S/S: / IMAGING: / COMPLICATION: prefixes required;
  no unlabeled clinical items
- mustMemorize: ALL items must carry a prefix — HIGH-YIELD: / BOARD FAVORITE: / DX: / TX: / S/S: /
  IMAGING: / COMPLICATION:; include numerical thresholds, named diagnostic criteria, first-line drugs,
  radiographic signs, and formulas
- boardTips: [TRAP] / [PEARL] / [TRICK] — prefix tag is mandatory on every tip
- quickRecall: board-style clinical scenario questions only — "A patient presents with..." format
- confusedWith: mandatory for any topic with look-alike conditions, similar presentations, or
  overlapping radiographic findings
- globalMustMemorize: all labeled with prefix; include cross-system thresholds, most-tested named
  criteria, and classic radiographic signs
```

---

## Expected Output Differences

### Topics where output should improve significantly

| Topic | Before (typical output) | After (expected output) |
|---|---|---|
| Pneumothorax | "tension pneumothorax is most dangerous" | "IMAGING: deep sulcus sign (supine) + tracheal deviation away from affected side" |
| Pulmonary Embolism | "PE is a blood clot in the lung" | "IMAGING: Hampton's hump + Westermark sign on CXR; S1Q3T3 on ECG = right heart strain" |
| Tuberculosis | "TB is caused by Mycobacterium tuberculosis" | "IMAGING: Ghon complex (primary) → Simon foci (reactivation) in upper lobe apices" |
| Respiratory Pathology | "treatment depends on severity" | "TX: CAP mild → Amoxicillin; CAP severe → beta-lactam + macrolide or fluoroquinolone" |

### Before/After: S/S output style

**Before:**
```
"keyPoints": [
  "most commonly presents with dyspnea",
  "board favorite: tension pneumothorax causes contralateral tracheal deviation",
  "distinguishing feature: absent breath sounds on affected side"
]
```

**After:**
```
"keyPoints": [
  "S/S: sudden pleuritic chest pain + ipsilateral decreased breath sounds + hypoxia",
  "S/S: tension pneumo → JVD + tracheal deviation away + hypotension (obstructive shock)",
  "DX: CXR expiration view shows lung edge + absent lung markings beyond it",
  "TX: needle decompression (2nd ICS MCL) → chest tube (4th–5th ICS AAL)",
  "IMAGING: deep sulcus sign on supine CXR (ICU patients)"
]
```

---

## Backward Compatibility

- Old cached reviewers (without prefix labels) render unchanged — `SemanticLabel` falls back to plain `formatBoardText` when no prefix is found
- New generations will produce prefix-labeled content that `SemanticLabel` renders as colored inline badges
- No schema change — `keyPoints`, `mustMemorize`, `globalMustMemorize` are still `string[]` in the Zod schema
- No progression, quiz, flashcard, or export changes

---

## What Was NOT Changed

- `QUIZ_TASK` — unchanged
- `FLASHCARD_TASK_BASE` — unchanged
- `METHOD_FLASHCARD_INSTRUCTIONS` — unchanged
- `buildConceptualTask`, `buildRetrievalTask`, `buildMemoryTask`, `buildRelationalTask` — unchanged
- `TUTOR_SYSTEM`, `METHOD_TUTOR_ADDENDUM` — unchanged
- `buildCheckpointFlashcardTask` — unchanged
- `buildQuizTask` — unchanged
- `OPEN_ANSWER_GRADE_TASK` — unchanged
- `buildRemediationPreamble` — unchanged
- `ADAPTIVE_SYSTEM_PREAMBLE` — unchanged (adaptive reviewers use their own schemas)
- `METHOD_INSTRUCTIONS` — unchanged
- Other `MODE_INSTRUCTIONS` entries (cram, conceptual, mastery) — unchanged

---

## Testing Guidance

To verify output quality after deployment, generate new reviewers for:

1. **Respiratory Pathology** — expect: labeled S/S clusters per disease, IMAGING signs for each, TX bullets per severity tier
2. **GI Pathology** — expect: DX criteria labeled, IMAGING findings for each condition, COMPLICATION labeled for each disease
3. **Pulmonary Embolism** — expect: Hampton's hump + Westermark labeled IMAGING:, D-dimer threshold in mustMemorize, Wells score in DX:
4. **Pneumothorax** — expect: tension vs spontaneous distinction in confusedWith, needle decompression step in TX:, deep sulcus sign in IMAGING:
5. **Tuberculosis** — expect: Ghon complex/Simon foci in IMAGING:, isoniazid + rifampicin regimen in TX:, PPD/IGRA criteria in DX:

For each: force-regenerate (clear cache), compare label density against Philippine review-center cram sheets. Every clinical fact should carry a prefix label in board_exam mode.

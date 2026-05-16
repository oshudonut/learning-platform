# Structured Reviewer Architecture
**Date**: 2026-05-16  
**Status**: DESIGN — not yet implemented  
**Scope**: Rendering and formatting evolution; data schema extensions only where required

---

## Guiding Principles

1. **Data and rendering are separate concerns.** The reviewer JSON produced by Claude is already structured. The rendering layer reads it and decides how to present it visually. Changing the render does not require changing the schema or the AI prompt.

2. **Additive, not replacement.** The existing methodology routing (`feynman → conceptual`, `active_recall → retrieval`, etc.) and progression system remain untouched. The board-exam formatting is a **rendering upgrade on top of** the existing data layer.

3. **Standard reviewer is already board-exam data.** The `Reviewer` type contains `mustMemorize`, `boardTips`, `confusedWith`, `globalMustMemorize`, `mnemonics`, `quickRecall`. The fields are right. What is missing is a **high-density visual rendering** of those fields.

4. **Minimal schema additions, maximum rendering improvements.** Only add new schema fields when the data cannot be derived from what Claude already produces.

---

## Current Architecture Snapshot

```
Claude prompt
    ↓
generateStructured({ schema: SCHEMA_MAP[schemaType], ... })
    ↓
AnyReviewer JSON stored in documents.reviewer (JSONB)
    ↓
ReviewerView.tsx
  ├── type check → dispatch to typed sub-view
  │     ConceptualReviewerView
  │     RetrievalReviewerView
  │     MemoryReviewerView
  │     RelationalReviewerView
  └── standard Reviewer → TopicContent (inline render)
         ↓
         Sequential card render per section
         (simple list, minimal callout styling)
```

**Current render output**: Scrollable list of cards with labeled sections. Readable but not high-density. Does not resemble a cram sheet or board-exam handout.

---

## Target Architecture

```
Claude prompt  (unchanged)
    ↓
generateStructured  (unchanged)
    ↓
AnyReviewer JSON  (unchanged; minor optional extensions)
    ↓
ReviewerView.tsx  (updated dispatch)
  ├── Standard Reviewer
  │     ↓
  │     BoardExamTopicRenderer
  │       ├── SectionHeader (topic #, progress tick)
  │       ├── CoreIdeaBanner (yellow highlight stripe)
  │       ├── TwoColumnBody
  │       │     ├── LEFT: KeyPoints + QuickBreakdown
  │       │     └── RIGHT: MustMemorize callout box
  │       ├── ConfusedWith (diff table, red/green)
  │       ├── BoardTips strip (blue rule)
  │       ├── QuickRecall box (emerald background)
  │       └── Mnemonics + GlobalMustMemorize (last section only)
  │
  ├── ConceptualReviewer → ConceptualBoardRenderer (enhanced)
  ├── RetrievalReviewer  → RetrievalBoardRenderer  (enhanced)
  ├── MemoryReviewer     → MemoryBoardRenderer      (enhanced)
  └── RelationalReviewer → RelationalBoardRenderer   (enhanced)
         ↓
         Each renderer maps the same field set to board-exam-appropriate visual patterns
         (See methodology-rendering-map.md)

Export pipeline  (parallel, shared data)
  ├── DOCX (enhanced template — see export-template-system.md)
  └── PDF  (new: HTML→PDF via headless render or @react-pdf/renderer)
```

---

## Data Layer — What Already Exists

| Field | Standard | Conceptual | Retrieval | Memory | Relational |
|---|---|---|---|---|---|
| title | ✅ | ✅ | ✅ | ✅ | ✅ |
| summary | ✅ | ✅ | ✅ | ✅ | ✅ |
| topics[] | ✅ | ✅ | ✅ | ✅ | ✅ |
| coreIdea / centralConcept | ✅ | — | — | ✅ | ✅ |
| keyPoints | ✅ | — | — | — | — |
| mustMemorize | ✅ | — | — | anchors | — |
| boardTips | ✅ | — | — | — | — |
| confusedWith | ✅ | — | — | — | contrastsWith |
| quickRecall | ✅ | selfCheck | questions | — | crossLinks |
| globalMustMemorize | ✅ | — | finalChallenge | masterAnchors | conceptMap |
| mnemonics | ✅ | — | — | associations | — |
| analogy | — | ✅ | — | — | — |
| mechanism | — | ✅ | — | — | — |
| blurtPrompt | — | — | ✅ | — | — |
| commonMistakes | — | — | ✅ | — | — |
| memory anchors | — | — | — | ✅ | — |
| nodes/crossLinks | — | — | — | — | ✅ |

**The standard reviewer already has everything needed for a board-exam render.**  
The adaptive types need mapped rendering, not new fields.

---

## Proposed Schema Extensions (Optional)

These are the **only** additions recommended. All optional — renderers gracefully omit missing fields.

### 1. `clinicalPearls` on ReviewerTopic (standard only)
```typescript
clinicalPearls?: string[]  // 0–3 items; clinical application shortcuts
```
Prompt addition: `"clinicalPearls": ["brief clinical shortcut — 0-3 items, omit if not clinical content"]`

### 2. `testTrick` on ReviewerTopic (standard only)
```typescript
testTrick?: string  // single sentence exam elimination strategy
```
This supplements `boardTips` (which can be 1–3 items) with a single highlighted call-to-action.

### 3. `difficulty` on `boardTips` entries
Rather than changing the schema, boardTips can adopt inline tagging: `"[TRAP] Confuse X for Y"`, `"[TRICK] If you see X, think Y"`. The renderer parses the `[TAG]` prefix and applies styling. No schema change required.

---

## Component Boundaries

| Component | File | Responsibility |
|---|---|---|
| `ReviewerView` | existing | Dispatch: detect type, route to renderer |
| `BoardExamTopicRenderer` | NEW | Board-exam styled topic card (standard reviewer) |
| `ConceptualBoardRenderer` | NEW | Board-exam styled conceptual topic card |
| `RetrievalBoardRenderer` | NEW | Board-exam styled retrieval topic card |
| `MemoryBoardRenderer` | NEW | Board-exam styled memory topic card |
| `RelationalBoardRenderer` | NEW | Board-exam styled relational topic card |
| `ProgressionShell` | existing `ReviewerView` wrapper | Section nav, progress bar, checkpoints — unchanged |
| `BoardExamCallout` | NEW primitive | Reusable callout box (amber, blue, red, green variants) |
| `DiffTable` | NEW primitive | Two-column "confuse X vs Y" comparison table |
| `MnemonicCard` | NEW primitive | Memory device display with priority badge |

**`ProgressionShell` is NEVER touched.** Section completion, checkpoint triggers, `onSectionComplete`, `onStartFlashcards` — all stay in the current `ReviewerView` wrapper exactly as-is.

---

## Progression Compatibility

The board-exam rendering layer is purely presentational. No changes to:
- `DocumentProgression` type
- `sectionStatuses` shape
- Checkpoint trigger logic
- `onSectionComplete` callback
- `flashcardChallengeCompleted` gating
- `quizUnlocked` conditions

The renderer receives the same props as today and produces visual output only.

---

## Export Compatibility

Current DOCX export reads fields from standard `Reviewer` only and checks for `topics`, `summary`, `globalMustMemorize`. This constraint is preserved.

The board-exam formatting upgrade **enhances** the DOCX template (more callout boxes, two-column layout, color scheme) without changing what fields are required. PDF export is a net-new capability added in parallel — it does not replace DOCX.

See `export-template-system.md` for the full export architecture.

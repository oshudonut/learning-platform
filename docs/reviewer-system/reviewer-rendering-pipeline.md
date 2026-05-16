# Reviewer Rendering Pipeline
**Date**: 2026-05-16  
**Status**: DESIGN

---

## Pipeline Overview

```
AnyReviewer JSON (from documents.reviewer)
         │
         ▼
   ReviewerView.tsx
   ┌─────────────────────────────────────────────┐
   │  1. Type detection                          │
   │     "type" field → adaptive branch          │
   │     no "type" field → standard branch       │
   │                                             │
   │  2. Progression shell injection             │
   │     sectionStatuses, currentIdx, callbacks  │
   │     (UNTOUCHED — progression logic stays)   │
   │                                             │
   │  3. Topic routing per active section        │
   │     Standard    → BoardExamTopicRenderer    │
   │     Conceptual  → ConceptualBoardRenderer   │
   │     Retrieval   → RetrievalBoardRenderer    │
   │     Memory      → MemoryBoardRenderer       │
   │     Relational  → RelationalBoardRenderer   │
   └─────────────────────────────────────────────┘
         │
         ▼
   Per-topic board-exam component
   ┌─────────────────────────────────────────────┐
   │  Each renderer:                             │
   │  a. Renders the active topic card           │
   │  b. Renders last-section global content     │
   │     (globalMustMemorize / masterAnchors /   │
   │      finalChallenge / conceptMap)           │
   │  c. Emits "Mark Complete" CTA (unchanged)  │
   └─────────────────────────────────────────────┘
         │
         ▼
   CompletionScreens (unchanged)
   ReviewerCompleteScreen → flashcard challenge gate
   "All Done" → quiz unlock
```

---

## Stage 1 — Type Detection

Current logic in `ReviewerView.tsx` (preserve exactly):

```typescript
const isAdaptive = "type" in reviewer;
if (isAdaptive) {
  switch (reviewer.type) {
    case "conceptual": return <ConceptualReviewerView ... />;
    case "retrieval":  return <RetrievalReviewerView ... />;
    case "memory":     return <MemoryReviewerView ... />;
    case "relational": return <RelationalReviewerView ... />;
  }
}
// Standard reviewer
return <StandardReviewerView ... />;
```

**Change**: Replace `<XxxReviewerView>` with `<XxxBoardRenderer>` components. The wrapper (progression logic, section navigation, completion screens) stays identical. Only the per-topic card is swapped.

---

## Stage 2 — Progression Shell (DO NOT MODIFY)

The progression shell handles:
- Section progress bar (currentIdx / total)
- Completed sections list
- Checkpoint detection and `CheckpointChallenge` trigger
- `onSectionComplete(sectionIndex)` callback → API call
- `onStartFlashcards` callback
- `ReviewerCompleteScreen` render when allComplete + !flashcardChallengeCompleted
- "All Done" render when allComplete + flashcardChallengeCompleted

These are **layout wrappers around** the topic content. The board-exam renderer plugs into the slot currently occupied by `<TopicContent />`. Everything above and below that slot is unchanged.

```
┌──────────────────────────────────────────────┐
│  SECTION PROGRESS BAR  (unchanged)           │
├──────────────────────────────────────────────┤
│  COMPLETED SECTIONS LIST  (unchanged)        │
├──────────────────────────────────────────────┤
│                                              │
│  ◄ BOARD-EXAM TOPIC RENDERER ►              │  ← swap happens here
│    (replaces TopicContent)                   │
│                                              │
├──────────────────────────────────────────────┤
│  MARK COMPLETE CTA  (unchanged)              │
└──────────────────────────────────────────────┘
```

---

## Stage 3 — Board-Exam Topic Renderer Layout

### Standard Reviewer (`BoardExamTopicRenderer`)

```
┌─ SECTION HEADER ──────────────────────────────────┐
│  [§ N]  TOPIC TITLE               [method badge]  │
└───────────────────────────────────────────────────┘

┌─ CORE IDEA BANNER ─────────────────────────────── ┐
│  ▶  {topic.coreIdea}                              │
│     (amber left border, yellow-50 bg)             │
└───────────────────────────────────────────────────┘

┌─ LEFT COLUMN ─────────┐  ┌─ RIGHT COLUMN ─────────┐
│  KEY POINTS           │  │  MUST MEMORIZE          │
│  • short phrase       │  │  ★ fact / formula       │
│  • short phrase       │  │  ★ threshold / def      │
│  • short phrase       │  │  (amber callout box)    │
│                       │  │                         │
│  QUICK BREAKDOWN      │  │  BOARD TIPS             │
│  – simplified bullet  │  │  ✦ trap / shortcut      │
│  – simplified bullet  │  │  ✦ exam pattern         │
│                       │  │  (blue left rule)       │
└───────────────────────┘  └─────────────────────────┘

┌─ DON'T CONFUSE ─────────────────────────────────── ┐
│  [X]  confused item          [✓]  key distinction  │
│  (side-by-side diff table, red border left col)    │
└───────────────────────────────────────────────────┘

┌─ QUICK RECALL ─────────────────────────────────── ┐
│  ?  Active recall prompt 1                        │
│  ?  Active recall prompt 2                        │
│     (emerald bg, italic)                          │
└───────────────────────────────────────────────────┘

── Last section only ───────────────────────────────

┌─ GLOBAL MUST MEMORIZE ─────────────────────────── ┐
│  ★ high-yield cross-topic fact                    │
│  ★ high-yield cross-topic fact                    │
│  (full width, amber callout, numbered)            │
└───────────────────────────────────────────────────┘

┌─ MEMORY AIDS ─────────────────────────────────── ─┐
│  ╔══════════════════╗  ╔══════════════════════╗   │
│  ║ concept name     ║  ║ concept name         ║   │
│  ║ mnemonic text    ║  ║ mnemonic text        ║   │
│  ╚══════════════════╝  ╚══════════════════════╝   │
│  (2-column grid, star icon, primary border)       │
└───────────────────────────────────────────────────┘
```

### Conditional render rules

| Block | Render condition |
|---|---|
| CoreIdeaBanner | Always (topic.coreIdea always present) |
| KeyPoints column | topic.keyPoints.length > 0 |
| MustMemorize column | topic.mustMemorize.length > 0 |
| QuickBreakdown | topic.quickBreakdown.length > 0 |
| BoardTips | topic.boardTips.length > 0 |
| DiffTable (ConfusedWith) | topic.confusedWith?.length > 0 |
| QuickRecall | topic.quickRecall.length > 0 |
| GlobalMustMemorize | last section AND reviewer.globalMustMemorize.length > 0 |
| MnemonicCards | last section AND reviewer.mnemonics.length > 0 |

---

## Stage 4 — Shared Primitive Components

### `BoardExamCallout`
```tsx
type CalloutVariant = "amber" | "blue" | "emerald" | "red" | "muted";
interface Props {
  variant: CalloutVariant;
  label: string;
  icon?: LucideIcon;
  badge?: string;
  children: React.ReactNode;
}
```
Variants map to Tailwind color scales. `label` is ALL CAPS, small-caps tracking. `badge` renders a chip (e.g., "HIGH YIELD").

### `DiffTable`
```tsx
interface DiffRow { item: string; distinction: string; }
interface Props { rows: DiffRow[]; }
```
Two-column table: left col red-tinted ("Don't confuse X"), right col green-tinted ("Key difference"). No actual `<table>` — use CSS grid for PDF compatibility.

### `MnemonicCard`
```tsx
interface Props { concept: string; aid: string; }
```
Card with star icon, concept name in bold, aid text in italic. Primary border. Used in 2-column grid on last section.

### `PriorityBadge`
```tsx
type Priority = "HIGH" | "MEDIUM" | "LOW";
interface Props { priority: Priority; }
```
Used by MemoryBoardRenderer for anchor priority. RED=HIGH, AMBER=MEDIUM, MUTED=LOW.

### `BoardTipStrip`
```tsx
interface Props { tips: string[]; }
```
Each tip on its own row with blue left border rule. Parses inline `[TRAP]` / `[TRICK]` / `[PEARL]` prefixes and renders as colored micro-badge before the tip text.

---

## Render Data Flow (per section)

```typescript
// ReviewerView (shell) computes:
const currentTopic = reviewer.topics[currentIdx];
const isLastSection = currentIdx === reviewer.topics.length - 1;
const isStandard = !("type" in reviewer);

// Passes to renderer:
<BoardExamTopicRenderer
  topic={currentTopic}           // ReviewerTopic
  isLastSection={isLastSection}
  globalMustMemorize={reviewer.globalMustMemorize}
  mnemonics={reviewer.mnemonics}
  learningMethod={learningMethod}  // for badge
  studyMode={studyMode}            // for badge
/>
```

No new props needed on the shell or the callbacks. The renderer is a pure display component.

---

## Responsive Layout Strategy

| Viewport | Layout |
|---|---|
| Mobile (`< sm`) | Single column; CalloutBoxes full width; DiffTable stacked |
| Tablet (`sm–lg`) | Single column with wider cards |
| Desktop (`> lg`) | Two-column body (KeyPoints / MustMemorize); DiffTable side-by-side |

The two-column body layout collapses to single column below `lg`. This is a CSS grid change only — no logic branching.

---

## Print / PDF Render Mode

A `printMode` boolean prop on the top-level renderer activates print-specific styles:
- Remove all interactive buttons (Mark Complete, tooltips)
- Expand collapsed sections
- Use `break-inside: avoid` on callout boxes
- Increase font size to 11pt equivalent
- Remove amber/blue background fills → use borders only (ink-efficient)
- Force two-column body layout regardless of viewport

This enables the same component tree to render a print-ready PDF via `window.print()` or headless browser capture without a separate template.

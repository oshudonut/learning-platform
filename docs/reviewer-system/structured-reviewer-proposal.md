# Structured Reviewer Upgrade — Implementation Proposal
**Date**: 2026-05-16  
**Status**: PROPOSAL — awaiting approval before implementation

---

## 1. Minimal Viable Structured Reviewer (MVE)

**Definition**: The smallest change that makes a standard reviewer look and feel like a board-exam cram sheet, with zero risk to the progression system and no schema changes.

### What It Is

A new rendering component (`BoardExamTopicRenderer`) that replaces the current `TopicContent` inline render inside `ReviewerView`. The data is identical — only the visual treatment changes.

### What Changes

| File | Change | Risk |
|---|---|---|
| `ReviewerView.tsx` | Replace `<TopicContent />` with `<BoardExamTopicRenderer />` | LOW |
| `components/reviewer/board-exam/BoardExamTopicRenderer.tsx` | NEW — 2-column board-exam layout | NONE (new file) |
| `components/reviewer/primitives/BoardExamCallout.tsx` | NEW — reusable callout box | NONE |
| `components/reviewer/primitives/DiffTable.tsx` | NEW — confusedWith diff renderer | NONE |
| `components/reviewer/primitives/MnemonicCard.tsx` | NEW — mnemonic card grid | NONE |
| `components/reviewer/primitives/BoardTipStrip.tsx` | NEW — board tips with tag parsing | NONE |
| `components/reviewer/primitives/formatBoardText.ts` | NEW — inline number/arrow formatter | NONE |

**Total**: 1 modified file (single line change), 6 new files.

### What Does NOT Change

- `DocumentProgression` type
- `sectionStatuses`, checkpoint detection, completion logic
- `onSectionComplete`, `onStartFlashcards` callbacks
- All adaptive reviewer types and their dedicated views
- All API routes
- Database schema
- Export routes (DOCX/PDF)
- `lib/prompts.ts` — no prompt changes needed
- `lib/types.ts` — no schema changes needed

### Expected Visual Result

A standard reviewer topic card transforms from a single-column list of labeled sections (~1400px tall on desktop) into a two-column board-exam card (~400px tall) with:
- Amber Core Idea banner (full width)
- Left column: Key Points + Quick Breakdown
- Right column: Must Memorize callout (amber) + Board Tips (blue rule)
- Full-width: Don't Confuse diff table (if present)
- Full-width: Quick Recall emerald box
- Last section: Global Must Memorize + Mnemonic cards

---

## 2. Safest Integration Path

### Step 1: Primitives first (no visible change)

Build `BoardExamCallout`, `DiffTable`, `MnemonicCard`, `BoardTipStrip`, `formatBoardText` as isolated components. No imports in any existing file. No visible effect. Testable in isolation.

### Step 2: Build `BoardExamTopicRenderer` using primitives

Build the full renderer against the current `ReviewerTopic` type. Accept the same data it receives today. Do not import it from `ReviewerView` yet.

### Step 3: Feature-flag swap (one line in ReviewerView)

```typescript
// ReviewerView.tsx — the only change to existing code:
// Before:
<TopicContent topic={currentTopic} ... />
// After:
<BoardExamTopicRenderer topic={currentTopic} isLastSection={isLastSection} ... />
```

This is a single JSX element swap. If it causes any visual regression, revert this one line.

### Step 4: Adaptive renderers (separate sessions)

After standard reviewer is validated, build adaptive renderers one methodology at a time. Each is independent — adding `ConceptualBoardRenderer` doesn't affect retrieval or memory.

### Step 5: Export enhancement (separate sessions)

DOCX enhancement and PDF addition are fully independent from the rendering layer — they read from the same JSON, just produce different output formats.

---

## 3. Rendering / Data Separation Strategy

### Principle: No data logic in renderers

Renderers are **pure display components**. They:
- Accept typed props derived from `AnyReviewer`
- Produce JSX
- Make no API calls
- Read no progression state
- Execute no callbacks (they receive them as props from the shell)

All data derivation happens in `ReviewerView` (the shell) before passing to the renderer:
```typescript
// Shell computes:
const currentTopic = reviewer.topics[localIdx];
const isLastSection = localIdx === reviewer.topics.length - 1;
const globalItems = isStandard ? reviewer.globalMustMemorize : [];
const mnemonicsItems = isStandard ? reviewer.mnemonics : [];

// Renderer only renders:
<BoardExamTopicRenderer
  topic={currentTopic}
  isLastSection={isLastSection}
  globalMustMemorize={globalItems}
  mnemonics={mnemonicsItems}
  learningMethod={learningMethod}
  studyMode={studyMode}
/>
```

### Schema stability

The rendering upgrade requires **zero schema changes** for Phase 1 (standard reviewer). The two optional schema additions proposed (`clinicalPearls`, `testTrick`) are strictly optional and can be added in Phase 2 or not at all.

If additions are made later:
- Add to `ReviewerTopicSchema` as `z.array(z.string()).optional()`
- Add to the prompt instruction as a soft constraint
- Renderer gracefully handles missing fields (conditional render)

No migration needed — stored reviewers without the new fields simply don't render those sections.

---

## 4. Progression Compatibility Strategy

**No changes required.** The progression system is entirely unaffected by the rendering upgrade.

The only prop the progression shell cares about from the reviewer is `reviewer.topics.length` (to build section statuses and checkpoint thresholds). This doesn't change.

The rendering layer only reads:
- `reviewer.topics[currentIdx]` — the active topic object
- `reviewer.globalMustMemorize` — last section content
- `reviewer.mnemonics` — last section content
- `"type" in reviewer` — for type dispatch

None of these reads affect progression state. The section completion flow is:
```
user clicks "Mark Complete"
  → onSectionComplete(sectionIndex) callback
    → POST /api/progression (complete_section)
      → progression updated in DB
        → client state updated
          → next section shown

// Renderer never touches this flow
```

---

## 5. Export Compatibility Strategy

### Phase 1: No change to existing DOCX

The enhanced DOCX template and new PDF route are built in isolation. The existing `GET /api/export` route and `buildDocx` function remain untouched during the rendering upgrade.

### Phase 2: Enhanced DOCX (additive)

The enhanced DOCX template reads the same `Reviewer` fields. It produces a better-formatted document. The gate logic (`quizUnlocked`, reviewer type check) is unchanged.

The refactor is internal to `buildDocx` — it replaces flat `Paragraph` calls with `Table`-based callout boxes. The API surface (`GET /api/export?id=...`) doesn't change.

### Phase 3: PDF (new capability)

New route, no existing route modified. Client updated to show a PDF download button alongside the DOCX button. Gate: same as DOCX initially, can be relaxed later.

### Reviewer type gate

The current 422 guard for adaptive reviewers in DOCX export stays in place:
```typescript
if (!reviewer.topics || !reviewer.summary || !reviewer.globalMustMemorize) {
  return NextResponse.json({ error: "DOCX export only for standard reviewers." }, { status: 422 });
}
```

PDF export initially carries the same guard. Once methodology-specific PDF templates are built (Phase 2 of PDF), the guard is relaxed per type.

---

## Recommended Execution Order

| Phase | What | When |
|---|---|---|
| **MVE** | 6 new files + 1 line change in ReviewerView | Next session |
| Phase 2A | ConceptualBoardRenderer | After MVE validated |
| Phase 2B | RetrievalBoardRenderer | After 2A |
| Phase 2C | MemoryBoardRenderer + AnchorCard | After 2B |
| Phase 2D | RelationalBoardRenderer | After 2C |
| Phase 3A | Print HTML (`window.print()`) | Parallel with any phase |
| Phase 3B | DOCX template enhancement | After MVE |
| Phase 3C | PDF (`@react-pdf/renderer`) | After 3B |
| Phase 4 | Schema extensions (clinicalPearls, testTrick) | Optional, after 3C |

---

## Open Questions Before Implementation

1. **PDF gate**: Should PDF download require `quizUnlocked`, or should the reviewer be exportable at any time? The reviewer content is not exam-question sensitive.

2. **Print button placement**: In the section header next to "Regenerate"? Or in the document page header?

3. **formatBoardText scope**: Apply inline formatting only to `mustMemorize` items (where numbers/formulas dominate), or to all bullet fields?

4. **Adaptive renderer priority**: Which adaptive type is most commonly used? That should be Phase 2A to maximize impact.

5. **DiffTable single vs multi**: `confusedWith` is currently an array — if there are 3 confused pairs, should DiffTable show 3 rows or 3 separate tables?

# Reviewer UI Redesign
**Date**: 2026-05-16  
**Status**: DESIGN

---

## Design Goals

1. **Board-exam scan pattern** — a student should be able to scan a topic card in 30 seconds and know what to memorize, what to avoid confusing, and how to recall it.
2. **Visual density without clutter** — more information per scroll height, achieved through tighter spacing and two-column layout (not by removing content).
3. **Methodology identity** — each learning method looks distinctly different in rendering, reinforcing the cognitive pattern it teaches.
4. **Zero disruption to progression** — UI is a rendering layer only; no changes to state, callbacks, or completion logic.

---

## Component File Map

```
components/reviewer/
  ReviewerView.tsx                     EXISTING — modify dispatch only
  ProgressionShell.tsx                 NEW — extract shell from ReviewerView
  board-exam/
    BoardExamTopicRenderer.tsx         NEW — standard reviewer topic card
    ConceptualBoardRenderer.tsx        NEW — conceptual topic card
    RetrievalBoardRenderer.tsx         NEW — retrieval topic card
    MemoryBoardRenderer.tsx            NEW — memory topic card
    RelationalBoardRenderer.tsx        NEW — relational topic card
  primitives/
    BoardExamCallout.tsx               NEW — reusable callout box
    DiffTable.tsx                      NEW — confusedWith / contrastsWith
    MnemonicCard.tsx                   NEW — mnemonic memory aid card
    AnchorCard.tsx                     NEW — memory anchor with priority
    PriorityBadge.tsx                  NEW — HIGH/MEDIUM/LOW badge
    BoardTipStrip.tsx                  NEW — board tips with [TAG] parsing
    MechanismFlow.tsx                  NEW — → arrow step chain
    BlurtChallenge.tsx                 NEW — retrieval blurt prompt
    QuestionAccordion.tsx              NEW — Q/A reveal card
    formatBoardText.ts                 NEW — inline text pattern formatter
```

**Total new files**: 16 (14 components + 1 TypeScript utility + 1 shell extraction)  
**Modified files**: 1 (`ReviewerView.tsx` — dispatch only)

---

## Migration Strategy: ReviewerView.tsx

### Current structure (simplified)

```tsx
function ReviewerView({ reviewer, progression, ... }) {
  // 1. State: localIdx, saving
  // 2. allComplete check
  // 3. Checkpoint detection
  // 4. Completion screen renders
  // 5. Adaptive type dispatch (renders entire view for each type)
  // 6. Standard topic render (inline TopicContent)
  // 7. Progress bar, completed list
  // 8. Mark Complete button
}
```

### Target structure

```tsx
// ReviewerView.tsx — thin dispatch + shell
function ReviewerView({ reviewer, progression, ... }) {
  // All progression logic stays here (unchanged):
  // localIdx, allComplete, checkpoint detection, completion screens,
  // progress bar, completed list, mark complete button

  // Only change: replace TopicContent with board-exam renderer
  const TopicRenderer = getTopicRenderer(reviewer);

  return (
    <ProgressionShell ...>
      <TopicRenderer
        topic={currentTopic}
        reviewer={reviewer}
        isLastSection={isLastSection}
        learningMethod={learningMethod}
        studyMode={studyMode}
      />
    </ProgressionShell>
  );
}

function getTopicRenderer(reviewer: AnyReviewer) {
  if (!("type" in reviewer)) return BoardExamTopicRenderer;
  switch (reviewer.type) {
    case "conceptual": return ConceptualBoardRenderer;
    case "retrieval":  return RetrievalBoardRenderer;
    case "memory":     return MemoryBoardRenderer;
    case "relational": return RelationalBoardRenderer;
  }
}
```

`ProgressionShell` is an internal wrapper component (not exported) extracted from `ReviewerView`. It contains the progress bar, completed sections list, checkpoint logic, and Mark Complete button. The topic renderer slot is passed as `children`.

---

## BoardExamTopicRenderer — Full Component Design

```tsx
interface BoardExamTopicProps {
  topic: ReviewerTopic;
  isLastSection: boolean;
  globalMustMemorize: string[];
  mnemonics: { concept: string; aid: string }[];
  learningMethod?: LearningMethod;
  studyMode?: StudyMode;
}

export function BoardExamTopicRenderer({
  topic, isLastSection, globalMustMemorize, mnemonics, learningMethod, studyMode
}: BoardExamTopicProps) {
  return (
    <div className="space-y-3">
      {/* Method + mode context badges */}
      <MethodBadgeRow method={learningMethod} mode={studyMode} />

      {/* Core Idea — always first */}
      <CoreIdeaBanner text={topic.coreIdea} />

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: Key Points + Quick Breakdown */}
        <div className="space-y-3">
          {topic.keyPoints.length > 0 && (
            <BoardExamCallout variant="muted" label="KEY POINTS" icon={Brain}>
              <ul className="space-y-1">
                {topic.keyPoints.map((kp, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground mt-0.5">•</span>
                    <span>{formatBoardText(kp)}</span>
                  </li>
                ))}
              </ul>
            </BoardExamCallout>
          )}
          {topic.quickBreakdown.length > 0 && (
            <BoardExamCallout variant="muted" label="QUICK BREAKDOWN" icon={Zap}>
              <ul className="space-y-1 text-muted-foreground">
                {topic.quickBreakdown.map((qb, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="mt-0.5">–</span>
                    <span>{formatBoardText(qb)}</span>
                  </li>
                ))}
              </ul>
            </BoardExamCallout>
          )}
        </div>

        {/* Right: Must Memorize + Board Tips */}
        <div className="space-y-3">
          {topic.mustMemorize.length > 0 && (
            <BoardExamCallout variant="amber" label="MUST MEMORIZE" icon={Target}>
              <ol className="space-y-1.5">
                {topic.mustMemorize.map((mm, i) => (
                  <li key={i} className="text-sm flex gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <span className="font-medium text-amber-900">{formatBoardText(mm)}</span>
                  </li>
                ))}
              </ol>
            </BoardExamCallout>
          )}
          {topic.boardTips.length > 0 && (
            <BoardTipStrip tips={topic.boardTips} />
          )}
        </div>
      </div>

      {/* Don't Confuse (full width) */}
      {(topic.confusedWith?.length ?? 0) > 0 && (
        <DiffTable rows={topic.confusedWith!} />
      )}

      {/* Quick Recall */}
      {topic.quickRecall.length > 0 && (
        <BoardExamCallout variant="emerald" label="QUICK RECALL" icon={HelpCircle}>
          <ul className="space-y-1">
            {topic.quickRecall.map((qr, i) => (
              <li key={i} className="text-sm italic text-emerald-800 flex gap-2">
                <span className="font-bold text-emerald-600">?</span>
                {qr}
              </li>
            ))}
          </ul>
        </BoardExamCallout>
      )}

      {/* Last section: Global Must Memorize + Mnemonics */}
      {isLastSection && (
        <>
          {globalMustMemorize.length > 0 && (
            <BoardExamCallout variant="amber" label="GLOBAL MUST MEMORIZE" icon={Target} badge="HIGH YIELD">
              <ol className="space-y-2">
                {globalMustMemorize.map((gm, i) => (
                  <li key={i} className="text-sm flex gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <span className="font-semibold text-amber-900">{formatBoardText(gm)}</span>
                  </li>
                ))}
              </ol>
            </BoardExamCallout>
          )}
          {mnemonics.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Memory Aids</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mnemonics.map((m, i) => (
                  <MnemonicCard key={i} concept={m.concept} aid={m.aid} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

---

## `formatBoardText` Utility

```typescript
// Returns ReactNode — applies inline styling to board-exam text patterns
export function formatBoardText(text: string): React.ReactNode {
  // Split on `:` or `=` — bold everything before, normal after
  // Bold numbers and thresholds (e.g., "55%", "1.2", "< 30")
  // Preserve → arrows as-is
  // Wrap [TAG] prefixes as badges
  // Return array of ReactNode spans

  // Simple implementation: regex-based, returns JSX
  const parts = text.split(/(\d+\.?\d*%?|→|≥|≤|<|>)/g);
  return parts.map((part, i) => {
    if (/^\d+\.?\d*%?$/.test(part)) {
      return <strong key={i} className="text-amber-700">{part}</strong>;
    }
    if (part === "→") {
      return <span key={i} className="text-primary font-medium mx-1">→</span>;
    }
    return part;
  });
}
```

---

## Visual Comparison: Before vs After

### Before (current TopicContent)

```
┌────────────────────────────────────────────────────┐
│  [§ 1]  Cardiac Physiology           [active]      │
│                                                    │
│  The heart pumps blood by coordinating...          │
│                                                    │
│  💡 Quick Recall                                   │
│     • What is cardiac output?                      │
│     • How does preload affect CO?                  │
│                                                    │
│  🧠 Key Points                                     │
│     • CO = HR × SV                                 │
│     • Normal EF: 55-70%                            │
│     • Preload affects SV via Starling's law        │
│                                                    │
│  ⚡ Quick Breakdown                                │
│     - Heart fills (diastole), ejects (systole)     │
│     - SNS increases HR and contractility           │
│                                                    │
│  🎯 Must Memorize                                  │
│     ① CO = HR × SV                                │
│     ② Normal EF = 55-70%                          │
│     ③ HF threshold: EF < 40%                      │
│                                                    │
│  ✅ Board Tips                                     │
│     • If asked about ↓ CO, think preload first    │
│     • EF < 40% = systolic dysfunction             │
└────────────────────────────────────────────────────┘
```

Height: ~1400px, single column, lots of white space.

### After (BoardExamTopicRenderer)

```
┌────────────────────────────────────────────────────┐
│  ▶  CO = HR × SV. Preload determines SV via       │  ← amber stripe
│     Starling's law; SNS modulates both.            │
├──────────────────────────┬─────────────────────────┤
│  KEY POINTS              │  MUST MEMORIZE          │
│  • CO = HR × SV          │  ① CO = HR × SV        │
│  • Normal EF: 55-70%     │  ② EF normal: 55-70%   │
│  • Preload affects SV    │  ③ HF: EF < 40%        │
│                          ├─────────────────────────┤
│  QUICK BREAKDOWN         │  BOARD TIPS             │
│  – Fill (diastole),      │  • ↓ CO → think         │
│    eject (systole)       │    preload first         │
│  – SNS: ↑ HR + inotropy  │  • EF < 40% = systolic  │
├──────────────────────────┴─────────────────────────┤
│  QUICK RECALL                                      │
│  ?  What is CO and what are its determinants?     │
│  ?  At what EF threshold is HF diagnosed?         │
└────────────────────────────────────────────────────┘
```

Height: ~400px, two-column, dense — same information.

---

## Implementation Phases

### Phase 1 (MVE — Minimal Viable Enhancement)

**Scope**: Standard reviewer only. Single renderer. Core primitives only.

Files:
- `components/reviewer/board-exam/BoardExamTopicRenderer.tsx`
- `components/reviewer/primitives/BoardExamCallout.tsx`
- `components/reviewer/primitives/DiffTable.tsx`
- `components/reviewer/primitives/MnemonicCard.tsx`
- `components/reviewer/primitives/BoardTipStrip.tsx`
- `components/reviewer/primitives/formatBoardText.ts`
- `ReviewerView.tsx` — 1 line change: swap `<TopicContent />` for `<BoardExamTopicRenderer />`

**Timeline**: 1 focused session. No schema changes. No API changes. No progression changes.

### Phase 2 — Adaptive Renderers

Add `ConceptualBoardRenderer`, `RetrievalBoardRenderer`, `MemoryBoardRenderer`, `RelationalBoardRenderer` with their type-specific primitives (`AnchorCard`, `MechanismFlow`, `BlurtChallenge`, `QuestionAccordion`).

### Phase 3 — Export

DOCX enhancement (table-based callouts). PDF with `@react-pdf/renderer`. Print HTML via `window.print()`.

---

## Regression Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Swap TopicContent for BoardExamTopicRenderer | LOW | Same props in, same callbacks out |
| Progression shell extraction | LOW | Logic is copy-moved, not rewritten |
| Two-column layout | NONE | CSS only, no state |
| formatBoardText | NONE | Additive text formatter, no schema change |
| DiffTable / MnemonicCard | NONE | Presentation only |
| Export DOCX enhanced template | LOW | Same data, different `docx` calls |
| PDF new route | NONE | New endpoint, no existing code changed |

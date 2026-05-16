# Methodology Rendering Map
**Date**: 2026-05-16  
**Status**: DESIGN

---

## Overview

Each methodology produces a different reviewer schema. Each schema maps to a dedicated renderer. The renderers share the same primitive callout components and design tokens but arrange them according to what the learning method emphasizes.

---

## Standard Reviewer → `BoardExamTopicRenderer`

**Schema**: `Reviewer` (standard)  
**Methods that produce it**: `pomodoro`, or no methodology selected  
**Rendering emphasis**: High-yield density, scan-first, board-exam format

| Section | Field | Visual Treatment |
|---|---|---|
| Core Idea Banner | `coreIdea` | Amber full-width stripe |
| Key Points | `keyPoints` | Bullet list, left column |
| Quick Breakdown | `quickBreakdown` | Dimmer bullets below key points |
| Must Memorize | `mustMemorize` | Amber callout, right column, numbered |
| Don't Confuse | `confusedWith` | DiffTable (red/green columns) |
| Board Tips | `boardTips` | Blue left-rule strip, [TAG] parsing |
| Quick Recall | `quickRecall` | Emerald box, italic prompts |
| Global HY (last) | `globalMustMemorize` | Full-width amber callout, HIGH YIELD badge |
| Memory Aids (last) | `mnemonics` | 2-column MnemonicCard grid |

**Layout**: Two-column body on desktop (KeyPoints+Breakdown / MustMemorize+BoardTips), single column on mobile.

---

## Conceptual Reviewer → `ConceptualBoardRenderer`

**Schema**: `ConceptualReviewer`  
**Methods**: `feynman`, `elaboration`, `multisensory`  
**Rendering emphasis**: Understanding over memorization. Analogies and mechanisms first. Self-check as active engagement.

| Section | Field | Visual Treatment |
|---|---|---|
| Core Idea Banner | `analogy` | Amber stripe with lightbulb icon (replaces coreIdea) |
| Explanation block | `simplifiedExplanation` | Prose paragraph, muted-foreground, 14px |
| Mechanism flow | `mechanism` | Step-by-step with → arrows, primary-colored connector line |
| Key Takeaways | `keyTakeaways` | Bullet list, standard weight |
| Self-Check | `selfCheck` | Emerald box (reuses Quick Recall callout), "Verify your understanding" label |
| Big Picture (last) | `bigPicture` | Full-width muted callout, "How it all connects" label |

**No DiffTable** — conceptual reviewers don't emphasize distinction comparisons.  
**No MustMemorize callout** — emphasis is on mechanisms, not memorization.  
**Mechanism flow rendering**:
```
┌─ MECHANISM ──────────────────────────────────────┐
│  1. Low CO → ↓ renal perfusion                  │
│          ↓                                        │
│  2. RAAS activation → aldosterone ↑              │
│          ↓                                        │
│  3. Na⁺/H₂O retention → ↑ preload               │
└───────────────────────────────────────────────────┘
```
Parse the `→` separator in each step. Render the arrow as a vertical connector in the spacing between items (CSS `::before` pseudo-element or explicit `<div>` with `h-4 w-px bg-primary/30`).

**Special for `multisensory`**: Add a "Visualize This" prompt beneath the analogy — a single question prompting the student to draw or diagram the concept. Sourced from `selfCheck[0]` if it starts with "Draw" or "Visualize", otherwise omit.

---

## Retrieval Reviewer → `RetrievalBoardRenderer`

**Schema**: `RetrievalReviewer`  
**Methods**: `active_recall`, `blurting`, `sq3r`, `pq4r`  
**Rendering emphasis**: Recall before reveal. Every topic starts with a challenge. Answers revealed progressively.

| Section | Field | Visual Treatment |
|---|---|---|
| Blurt Challenge | `blurtPrompt` | Full-width emerald box, bold text, stopwatch icon, "60 SECONDS" label |
| Questions | `questions[]` | Accordion or reveal cards (Q visible, A hidden until toggle) |
| Key Facts | `keyFacts` | Standard bullet list (shown after questions) |
| Common Mistakes | `commonMistakes` | Red-tinted callout, "❌ Common Mistake" label |
| Final Challenge (last) | `finalChallenge` | Amber callout, "SYNTHESIS CHALLENGE" label |

**Blurt Challenge** is always the **topmost** element — above everything else in the section. It occupies the full width and is visually dominant.

**Question accordion rendering**:
```
┌─ Q1 [EASY] ──────────────────────────────── [▼ Reveal] ─┐
│  What is the primary mechanism of ACE inhibitors?        │
│  ──────────────────────────────────────────────────────  │
│  ANSWER: Block conversion of angiotensin I to II,        │
│  reducing aldosterone and ATII-mediated vasoconstriction  │
└──────────────────────────────────────────────────────────┘
```
- Question always visible
- Answer hidden behind `useState` reveal toggle
- Difficulty tag: first Q = "EASY", last Q = "HARD", middle = "MEDIUM" (inferred from position, not stored)
- hint (if present) shown as italic grey text below the question, always visible

**sq3r / pq4r modes** add a "Survey" prompt at the top of the topic (before the blurt) that reads: "Survey this topic. What do you already know? What questions does the title raise?" — hardcoded text, no schema field needed.

---

## Memory Reviewer → `MemoryBoardRenderer`

**Schema**: `MemoryReviewer`  
**Methods**: `mnemonic`, `spaced_repetition`, `leitner`  
**Rendering emphasis**: Every fact paired with its memory device. Priority-based visual weight. Spaced repetition schedule visible.

| Section | Field | Visual Treatment |
|---|---|---|
| Core Idea | `coreIdea` | Amber banner (same as standard) |
| Memory Anchors | `anchors[]` | AnchorCard per fact |
| Associations | `associations[]` | Compact row with hook icon |
| Master Anchors (last) | `masterAnchors[]` | Full-width AnchorCard grid, HIGH YIELD badge |

**AnchorCard rendering**:
```
┌─────────────────────────────────────────────────────────┐
│  [HIGH]  ★  Cardiac output = HR × SV                   │
│  ACRONYM: CO-HR-SV → "Cats Have Sensitive Vet visits"   │
│  Review in: tomorrow                                     │
└─────────────────────────────────────────────────────────┘
```
- Priority badge: HIGH=red, MEDIUM=amber, LOW=slate
- Star icon before the fact
- Memory device in primary-color italic below
- "Review in: X" chip on right side
- Cards sorted: HIGH first, then MEDIUM, then LOW

**Priority badge parsing**: The `priority` field on each anchor is already `"HIGH" | "MEDIUM" | "LOW"` — no parsing needed. Direct render.

**Leitner box rendering** (when `leitner` method): Each anchor card shows which Leitner box it belongs to:
- The `anchor` field may contain "Box 1:", "Box 2:", "Box 3:" prefix — parse and render as box badge
- Box 1 = red (daily), Box 2 = amber (every 2 days), Box 3 = green (weekly)
- If no box prefix found, infer from `reviewIn`: "tomorrow"→Box 1, "3 days"→Box 2, "1 week"→Box 3

**Spaced repetition** (`spaced_repetition` method): Show the `reviewIn` field prominently as a schedule chip. Group anchors by review interval and show as separate rows: "Review tomorrow (X items)", "Review in 3 days (Y items)", "Review in 1 week (Z items)".

---

## Relational Reviewer → `RelationalBoardRenderer`

**Schema**: `RelationalReviewer`  
**Methods**: `mind_maps`, `interleaving`  
**Rendering emphasis**: Relationships, dependencies, and cross-topic connections. Visual network structure.

| Section | Field | Visual Treatment |
|---|---|---|
| Central Concept | `centralConcept` | Blue banner (replaces amber — relational emphasis) |
| Concept Nodes | `nodes[]` | NodeCard per concept |
| Cross-Links | `crossLinks[]` | Arrow-chain row: FROM → via → TO |
| Contrasts With | `contrastsWith[]` | DiffTable (reuses standard primitive) |
| Concept Map (last) | `conceptMap[]` | Full-width relationship list |

**NodeCard rendering**:
```
┌─ CONCEPT NODE ───────────────────────────────────────┐
│  ⬡  {concept.concept}                               │
│                                                      │
│  Leads to:                                           │
│    → child 1                                         │
│    → child 2                                         │
│                                                      │
│  Connects to topics:  [Topic A]  [Topic B]           │
└──────────────────────────────────────────────────────┘
```
- Hexagon icon (`⬡`) differentiates nodes from bullets
- "Leads to" children as arrow list
- Connected topics as clickable-looking chips (not interactive — just styled)

**Cross-links rendering**:
```
CARDIAC OUTPUT  ──[requires]──▶  PRELOAD
PRELOAD         ──[enables]───▶  STROKE VOLUME
```
Each crossLink as a horizontal flow row: `from` → `[via]` styled chip → `to`. The `via` field (relationship verb) is displayed as a labeled connector.

**Concept Map (last section)**: Full-width list of all global relationships. Same arrow-chain format. Grouped by `from` concept.

**`interleaving` mode**: After the concept map, add a "Contrast Across Topics" section that shows contrastsWith entries from all topics in a single combined DiffTable — emphasizing the interleaving philosophy of comparing concepts across sessions.

---

## Rendering Config Reference

| Method | Schema | Renderer | Top block | Memory device | Diff treatment |
|---|---|---|---|---|---|
| standard | standard | BoardExamTopicRenderer | CoreIdea amber | mnemonics grid | DiffTable |
| pomodoro | standard | BoardExamTopicRenderer | CoreIdea amber | mnemonics grid | DiffTable |
| feynman | conceptual | ConceptualBoardRenderer | Analogy amber | selfCheck emerald | none |
| elaboration | conceptual | ConceptualBoardRenderer | Analogy amber | selfCheck emerald | none |
| multisensory | conceptual | ConceptualBoardRenderer | Analogy amber + visualize | selfCheck emerald | none |
| active_recall | retrieval | RetrievalBoardRenderer | BlurtChallenge emerald | — | commonMistakes red |
| blurting | retrieval | RetrievalBoardRenderer | BlurtChallenge emerald | — | commonMistakes red |
| sq3r | retrieval | RetrievalBoardRenderer | Survey + BlurtChallenge | — | commonMistakes red |
| pq4r | retrieval | RetrievalBoardRenderer | Survey + BlurtChallenge | — | commonMistakes red |
| mnemonic | memory | MemoryBoardRenderer | CoreIdea amber | AnchorCards | none |
| spaced_repetition | memory | MemoryBoardRenderer | CoreIdea amber | AnchorCards + schedule | none |
| leitner | memory | MemoryBoardRenderer | CoreIdea amber | AnchorCards + box | none |
| mind_maps | relational | RelationalBoardRenderer | CentralConcept blue | — | DiffTable |
| interleaving | relational | RelationalBoardRenderer | CentralConcept blue | — | DiffTable + combined |

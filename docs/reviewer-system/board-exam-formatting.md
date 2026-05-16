# Board-Exam Formatting Specification
**Date**: 2026-05-16  
**Status**: DESIGN

---

## Design Philosophy

Board-exam reviewers are read under time pressure and scanned, not read linearly. Every formatting decision must serve one of three scanning patterns:

1. **Vertical scan** — "What are the key facts?" → numbered/bulleted lists with visual weight on bold terms
2. **Block scan** — "Where's the memory device? Where's the trap?" → distinct colored callout boxes with label headers
3. **Comparison scan** — "How do I tell X from Y?" → two-column diff tables, not prose

Every pixel of visual noise that doesn't serve one of these three purposes should be removed.

---

## Color System

| Role | Color | Tailwind | Hex | Usage |
|---|---|---|---|---|
| Core Idea | Amber | `amber-50` bg, `amber-600` border | `#fffbeb` / `#d97706` | CoreIdeaBanner highlight |
| Must Memorize | Amber | `amber-100` bg, `amber-500` text | `#fef3c7` / `#f59e0b` | MustMemorize callout |
| Board Tips | Blue | `sky-50` bg, `sky-600` border-l | `#f0f9ff` / `#0284c7` | Tip strip rule |
| Quick Recall | Emerald | `emerald-50` bg, `emerald-600` border | `#ecfdf5` / `#059669` | Recall challenge box |
| Don't Confuse | Red + Green | `red-50` / `green-50` cols | — | DiffTable columns |
| High Priority | Red | `red-100` bg, `red-600` text | — | Priority=HIGH badge |
| Medium Priority | Amber | `amber-100` bg, `amber-600` text | — | Priority=MEDIUM badge |
| Low Priority | Slate | `slate-100` bg, `slate-500` text | — | Priority=LOW badge |
| Clinical Pearl | Violet | `violet-50` bg, `violet-600` border | — | Pearl strip |
| Section Header | Primary | `primary/10` bg | — | Topic § number badge |

**Print mode**: All background fills removed; colored left borders or outline borders used instead. Text colors preserved.

---

## Typography Hierarchy

```
§ Section Header     — 11px ALL CAPS tracking-widest, muted
  Topic Title        — 18px font-semibold, foreground
  Core Idea          — 14px font-medium, italic, amber-900
  Label              — 10px ALL CAPS tracking-widest, muted-foreground
  Bullet text        — 13px regular, foreground
  Bold term          — 13px font-semibold, foreground
  Tip/Recall text    — 13px regular, sky-800 / emerald-800
  Mnemonic aid       — 13px italic, muted-foreground
  Global HY item     — 14px font-semibold, amber-800
```

No font families change — all use the existing design system font stack.

---

## Callout Box Anatomy

Every callout box follows this structure:

```
┌─────────────────────────────────────────────┐
│ [ICON] LABEL                    [BADGE?]    │ ← header row, border-bottom
├─────────────────────────────────────────────┤
│  content line 1                             │
│  content line 2                             │
│  ...                                        │
└─────────────────────────────────────────────┘
```

- `border-radius: 0.5rem` (rounded-lg)
- `padding: 0.75rem 1rem`
- Label: 10px ALL CAPS, tracking-widest, same color family as box
- Badge: `<span>` chip, xs size, right-aligned in header

---

## Individual Format Specifications

### 1. Core Idea Banner

```
╔═══════════════════════════════════════════════╗
║  ▶  The single most important concept here.   ║
╚═══════════════════════════════════════════════╝
```

- Full-width, `border-l-4 border-amber-400 bg-amber-50 px-4 py-3`
- Text: 14px italic font-medium amber-900
- Prefix: `▶` or `ChevronRight` icon in amber-500
- No label header — the visual treatment makes its purpose self-evident
- Always the first content block after the section header

### 2. Must Memorize Callout

```
┌─ MUST MEMORIZE ─────────────────── [HIGH YIELD] ─┐
│  ① Cardiac output = HR × SV                      │
│  ② Normal EF: 55–70%                             │
│  ③ Starling's law: ↑ preload → ↑ CO (to a point) │
└───────────────────────────────────────────────────┘
```

- `bg-amber-50 border border-amber-200 rounded-lg`
- Numbered items with `①②③` Unicode circled numbers (or styled `<span>` badges)
- Bold the formula/number/threshold; plain text the explanation
- Parsing rule: if item contains `:` or `=` → bold everything before the separator

### 3. Board Tips Strip

```
│ [TRAP]  If you see bilateral pitting edema, rule out right HF first.
│ [TRICK] MONA-BASH = morphine, oxygen, nitrates, aspirin, beta-blockers, ACE, statins, heparin
│ [PEARL] Kussmaul's sign: paradoxical JVD rise on inspiration = constrictive pericarditis
```

- Left blue rule: `border-l-4 border-sky-400 pl-4`
- Each tip on its own row, `mb-2`
- **Inline tag parsing**: text starting with `[TRAP]`, `[TRICK]`, `[PEARL]` strips the tag and renders as a micro-badge:
  - `[TRAP]` → red chip "TRAP"
  - `[TRICK]` → sky chip "TRICK"
  - `[PEARL]` → violet chip "PEARL"
  - No tag → default sky chip "TIP"
- Tag is optional; Claude currently doesn't emit them; they're future-friendly

### 4. Quick Recall Box

```
┌─ QUICK RECALL ─────────────────────────────────┐
│  ?  What is the first-line treatment for X?    │
│  ?  Differentiate A from B based on ___?       │
└─────────────────────────────────────────────────┘
```

- `bg-emerald-50 border border-emerald-200 rounded-lg`
- Prefix: `?` in emerald-600, 16px bold
- Text: italic, emerald-800
- Purpose: prompts active recall before section completion

### 5. DiffTable (Don't Confuse)

```
┌────────────────────────┬────────────────────────┐
│ ✗  Cardiac tamponade   │ ✓  Constrictive peri.  │
│    Pulsus paradoxus    │    Kussmaul's sign      │
│    Beck's triad        │    Pericardial knock     │
└────────────────────────┴────────────────────────┘
```

- CSS grid: `grid grid-cols-2 gap-0 border border-border rounded-lg overflow-hidden`
- Left col: `bg-red-50 border-r border-border px-3 py-2`
  - Header: `✗ {item}` in red-700 font-semibold
- Right col: `bg-green-50 px-3 py-2`
  - Header: `✓  Key difference:` in green-700 font-semibold
  - Body: `distinction` text in green-800

Currently `confusedWith` is `{ item, distinction }` — one pair. If multiple confusions exist, stack multiple DiffTable rows (grid rows, not multiple tables).

### 6. Mnemonic Card (2-column grid, last section only)

```
╔══════════════════════════╗  ╔══════════════════════════╗
║ ★  MUDPILES              ║  ║ ★  HHANG                  ║
║    Methanol              ║  ║    Hyperglycemia           ║
║    Uremia                ║  ║    Hypothyroidism          ║
║    DKA...                ║  ║    ...                     ║
╚══════════════════════════╝  ╚══════════════════════════╝
```

- `grid grid-cols-1 sm:grid-cols-2 gap-3`
- Each card: `border border-primary/20 rounded-lg p-3`
- Star icon: `text-primary`
- Concept name: `text-sm font-semibold`
- Aid text: `text-sm italic text-muted-foreground`

### 7. Global Must Memorize (full-width, last section only)

```
┌─ GLOBAL MUST MEMORIZE ─────────────────── [HIGH YIELD] ─┐
│  ① Cross-topic high-yield fact number one                │
│  ② Cross-topic high-yield fact number two                │
└──────────────────────────────────────────────────────────┘
```

- Same as MustMemorize callout but full-width, larger bottom margin
- Badge: "HIGH YIELD" in amber chip
- Items numbered with amber circled badges

---

## Inline Text Conventions

| Pattern | Render | Example |
|---|---|---|
| Numbers / thresholds | `font-semibold text-amber-700` | "EF < **55%**" |
| Drug names | `font-semibold` | "**Metformin**" |
| Formulas with `=` | Bold before `=`, normal after | "**CO** = HR × SV" |
| Arrow `→` | Literal `→`, no icon needed | "Preload → CO" |
| Subscripts / superscripts | `<sub>` / `<sup>` | "HCO₃⁻" |
| CAPS words (abbreviations) | No transform needed | "COPD", "MI" |

These are applied by a lightweight `formatBoardText(str: string): React.ReactNode` utility function that runs regex over bullet text and wraps matched patterns in styled spans. It does NOT parse full markdown — only these specific board-exam patterns.

---

## Density Targets

| Element | Target density | Current |
|---|---|---|
| Topic card height (6 items) | ~800px on desktop | ~1200px (sparse) |
| Whitespace between blocks | 8px (`gap-2`) | 16–24px (`gap-4/6`) |
| Font size (body bullets) | 13px | 14px |
| Two-column body | yes (desktop) | no (single column) |
| Callout headers | inline (no full row) | full rows |

Target: A single section should be fully readable on one screen on a laptop without scrolling past the CoreIdea and KeyPoints. The MustMemorize callout appears above the fold.

---

## Accessibility

- All color callouts include icon + label header — never color alone
- DiffTable uses `✗` / `✓` symbols + color (not color alone)
- PriorityBadges include "HIGH" / "MEDIUM" / "LOW" text (not color alone)
- Print mode: all colors convert to border/outline form — readable in black and white

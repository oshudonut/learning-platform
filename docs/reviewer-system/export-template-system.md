# Export Template System
**Date**: 2026-05-16  
**Status**: DESIGN

---

## Current Export State

| Format | Status | Gate | Notes |
|---|---|---|---|
| DOCX | ✅ Live | `quizUnlocked` + standard reviewer only | `docx` npm package via `app/api/export/route.ts` |
| PDF | ❌ Not built | — | Planned |
| HTML | ❌ Not built | — | Planned (print-ready) |

Current DOCX: functional but minimal — colored headings, bullet lists, no table support, no two-column layout.

---

## Target Export State

| Format | Priority | Method | Gate |
|---|---|---|---|
| DOCX (enhanced) | HIGH | `docx` package, enhanced template | `quizUnlocked` + standard reviewer |
| PDF | HIGH | HTML→PDF via headless or `@react-pdf/renderer` | `quizUnlocked` (all reviewer types) |
| Print HTML | MEDIUM | React component in print mode, `window.print()` | `quizUnlocked` |

---

## DOCX Enhancement Plan

### Current Template Gaps

| Gap | Current | Target |
|---|---|---|
| Two-column layout | ❌ Not supported | Table-based two-column (DOCX tables) |
| Callout boxes | ❌ None (flat labels) | Table cells with shaded background |
| DiffTable | ❌ None (prose bullets) | 2-column Table with header row shading |
| Priority badges | ❌ Parsed inline | Table cell + shaded background |
| Core Idea banner | ❌ Plain body text | Full-width table cell, amber shading |
| Mnemonic cards | ❌ Bulleted list | 2-column table with border |

### DOCX Callout Box (using docx Table)

The `docx` package supports `Table`, `TableRow`, `TableCell` with `shading`. Use tables to emulate callout boxes:

```typescript
// Amber callout (Must Memorize)
new Table({
  rows: [
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "FEF3C7" },
          borders: {
            top: { style: BorderStyle.SINGLE, color: "F59E0B", size: 4 },
            bottom: { style: BorderStyle.SINGLE, color: "F59E0B", size: 4 },
            left: { style: BorderStyle.SINGLE, color: "F59E0B", size: 4 },
            right: { style: BorderStyle.SINGLE, color: "F59E0B", size: 4 },
          },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "MUST MEMORIZE", bold: true, color: "B45309", size: 18 })],
            }),
            ...mustMemorizeItems.map(mm => mustMemorizeBullet(mm)),
          ],
        }),
      ],
    }),
  ],
  width: { size: 100, type: WidthType.PERCENTAGE },
})
```

### Two-Column Body (DOCX Table)

```typescript
new Table({
  columnWidths: [4500, 4500],  // twips, roughly 50/50
  rows: [
    new TableRow({
      children: [
        // Left: Key Points
        new TableCell({ children: [
          labelParagraph("KEY POINTS"),
          ...keyPoints.map(kp => bullet(kp)),
          labelParagraph("QUICK BREAKDOWN"),
          ...quickBreakdown.map(qb => bullet(qb)),
        ]}),
        // Right: Must Memorize + Board Tips
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "FFFBEB" },
          children: [
            labelParagraph("MUST MEMORIZE", "B45309"),
            ...mustMemorize.map(mm => mustMemorizeBullet(mm)),
            labelParagraph("BOARD TIPS", "0284C7"),
            ...boardTips.map(bt => bullet(bt)),
          ],
        }),
      ],
    }),
  ],
})
```

### DiffTable in DOCX

```typescript
new Table({
  columnWidths: [4500, 4500],
  rows: [
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "FEE2E2" },
          children: [new Paragraph({ children: [
            new TextRun({ text: "✗  " + item, bold: true, color: "B91C1C" }),
          ]})],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "DCFCE7" },
          children: [new Paragraph({ children: [
            new TextRun({ text: "✓  " + distinction, color: "15803D" }),
          ]})],
        }),
      ],
    }),
  ],
})
```

### Enhanced Color Palette (DOCX)

| Role | Hex | Usage |
|---|---|---|
| Amber bg (Must Memorize) | `FEF3C7` | Table cell shading |
| Amber border/text | `F59E0B` / `B45309` | Labels, borders |
| Sky bg (Board Tips) | `E0F2FE` | Table cell shading |
| Sky text | `0284C7` | Tips label |
| Emerald bg (Recall) | `ECFDF5` | Recall box shading |
| Red bg (Don't Confuse) | `FEE2E2` | Left DiffTable col |
| Green bg (Distinction) | `DCFCE7` | Right DiffTable col |
| Heading Red | `C0392B` | Topic headings (existing) |
| Label Blue | `1A5276` | Section labels (existing) |

---

## PDF Export Plan

### Approach: `@react-pdf/renderer`

**Rationale**: Avoids headless browser dependency (Puppeteer is 150MB+). `@react-pdf/renderer` renders JSX to PDF natively, runs in Node.js, works in Vercel serverless. Trade-off: subset of CSS (no grid, no flexbox gap, no pseudo-elements).

**Alternative considered**: HTML→PDF via Playwright. Rejected: too large for Vercel, cold start cost, complexity.

### New route: `GET /api/export/pdf`

Already exists as a stub. Needs implementation with `@react-pdf/renderer`.

### PDF Document Structure

```typescript
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 11, padding: 40, color: "#1a1a1a" },
  topicHeading: { fontSize: 14, fontWeight: "bold", color: "#C0392B", borderBottom: "1pt solid #C0392B", marginBottom: 6 },
  coreIdeaBanner: { backgroundColor: "#FFFBEB", borderLeft: "3pt solid #F59E0B", padding: "6pt 10pt", marginBottom: 8 },
  twoColRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  leftCol: { flex: 1 },
  rightCol: { flex: 1, backgroundColor: "#FFFBEB", padding: 8, borderRadius: 4 },
  calloutBox: { border: "1pt solid #E5E7EB", borderRadius: 4, padding: 8, marginBottom: 6 },
  label: { fontSize: 8, fontWeight: "bold", color: "#6B7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  bullet: { fontSize: 10, marginBottom: 2, paddingLeft: 12 },
  mustMemBullet: { fontSize: 10, color: "#B45309", fontWeight: "bold", marginBottom: 3 },
});

// Per-topic PDF component:
function TopicPDF({ topic, isLast, reviewer }) {
  return (
    <View break>
      <Text style={styles.topicHeading}>{topic.title}</Text>
      <View style={styles.coreIdeaBanner}>
        <Text style={{ fontSize: 10, fontStyle: "italic", color: "#78350F" }}>▶ {topic.coreIdea}</Text>
      </View>
      <View style={styles.twoColRow}>
        <View style={styles.leftCol}>
          {/* Key Points */}
          {/* Quick Breakdown */}
        </View>
        <View style={styles.rightCol}>
          {/* Must Memorize */}
          {/* Board Tips */}
        </View>
      </View>
      {/* DiffTable, Recall, etc. */}
    </View>
  );
}
```

### PDF Gate

Same as DOCX:
- Auth check
- `quizUnlocked` (or remove gate — see below)
- Standard reviewer type check (initially; expand to all types in Phase 2)

**Consideration**: Should PDF export require `quizUnlocked`? The reviewer content itself is not exam-question sensitive — only the quiz is. A reasonable UX: allow PDF export of the reviewer at any time (no gate), only gate the quiz content. This would be a gate policy change, not a schema change.

---

## Print HTML Mode

Lowest-friction approach for immediate value. No new package.

### Implementation

Add a `printMode` prop to `BoardExamTopicRenderer` (and all renderers). When true:
- Remove interactive buttons (`Mark Complete`, `Reveal Answer` toggles)
- Remove checkpoint challenge overlays
- Expand all collapsed sections
- Apply print-specific CSS via `@media print` or Tailwind `print:` variants:
  - `print:bg-transparent` on colored backgrounds → borders only
  - `print:text-black` on colored text
  - `print:break-inside-avoid` on callout boxes

Add a "Print" button to the reviewer header:
```typescript
<Button variant="outline" onClick={() => window.print()}>
  <Printer className="h-4 w-4" /> Print
</Button>
```

No server route needed. Instant value.

---

## Export Route Architecture (server)

```
GET /api/export?id={docId}&format={docx|pdf}
```

Consolidate the two export routes (`/api/export` and `/api/export/pdf`) under a single route with a `format` query param. Reduces duplication of auth/ownership/gate logic.

```typescript
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const format = searchParams.get("format") ?? "docx";

  // Auth, ownership, gate (shared)
  const doc = await getDocument(id, user.id);
  const progression = await getProgression(id, user.id);
  if (!progression?.quizUnlocked) return 403;

  if (format === "pdf") {
    return buildPdfResponse(doc);
  }
  return buildDocxResponse(doc);
}
```

**Migration**: Keep `/api/export/pdf` as a passthrough alias pointing to the new unified handler until the client is updated.

---

## Reviewer Export Compatibility Matrix

| Reviewer Type | DOCX | PDF (Phase 1) | PDF (Phase 2) |
|---|---|---|---|
| Standard | ✅ | ✅ | ✅ |
| Conceptual | ❌ (422) | ❌ | ✅ |
| Retrieval | ❌ (422) | ❌ | ✅ |
| Memory | ❌ (422) | ❌ | ✅ |
| Relational | ❌ (422) | ❌ | ✅ |

Phase 1 PDF: standard reviewer only (matches DOCX scope, minimal risk).  
Phase 2 PDF: all reviewer types — requires methodology-specific PDF templates.

The 422 response for adaptive reviewers in DOCX is preserved — DOCX template doesn't support non-standard fields. PDF is more flexible and can support all types in Phase 2.

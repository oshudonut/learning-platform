import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  PageBreak,
} from "docx";
import { getDocument, getProgression, getNotesByDocument, getHighlightsByDocument, listCollectionItems, getCollection } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { Reviewer } from "@/lib/types";
import type { ReviewerNote, ReviewerHighlight } from "@/lib/store";

export const runtime = "nodejs";

// ── Color palette ─────────────────────────────────────────────────────────────

const RED   = "C0392B";
const BLUE  = "1A5276";
const GOLD  = "7D6608";
const GRAY  = "888888";
const NOTE_BORDER = "CCCCCC";

// ── Highlight color map (OOXML → our color tags) ──────────────────────────────

function toDocxHighlight(tag: string): "yellow" | "green" | "cyan" | "magenta" {
  const map: Record<string, "yellow" | "green" | "cyan" | "magenta"> = {
    yellow: "yellow",
    green:  "green",
    blue:   "cyan",
    pink:   "magenta",
  };
  return map[tag] ?? "yellow";
}

// ── Annotation types ──────────────────────────────────────────────────────────

type Annotations = {
  notes: Map<number, ReviewerNote>;
  // key: `${topicIndex}:${fieldName}:${itemIndex}`
  highlights: Map<string, ReviewerHighlight[]>;
};

function buildAnnotations(
  notes: ReviewerNote[],
  highlights: ReviewerHighlight[],
): Annotations {
  const notesMap = new Map<number, ReviewerNote>();
  for (const n of notes) notesMap.set(n.topicIndex, n);

  const hlMap = new Map<string, ReviewerHighlight[]>();
  for (const h of highlights.filter((h) => !h.isStale)) {
    const key = `${h.topicIndex}:${h.fieldName}:${h.itemIndex}`;
    const arr = hlMap.get(key) ?? [];
    arr.push(h);
    hlMap.set(key, arr);
  }
  return { notes: notesMap, highlights: hlMap };
}

function fieldHighlights(
  ann: Annotations | undefined,
  topicIndex: number,
  fieldName: string,
  itemIndex: number,
): ReviewerHighlight[] {
  return ann?.highlights.get(`${topicIndex}:${fieldName}:${itemIndex}`) ?? [];
}

// ── Text run builder with highlight spans ─────────────────────────────────────

function highlightedRuns(text: string, highlights: ReviewerHighlight[]): TextRun[] {
  if (!highlights.length) return [new TextRun({ text, size: 20 })];

  const sorted = [...highlights].sort((a, b) => a.charStart - b.charStart);
  const runs: TextRun[] = [];
  let pos = 0;

  for (const h of sorted) {
    const s = Math.max(pos, Math.max(0, h.charStart));
    const e = Math.min(text.length, h.charEnd);
    if (e <= s) continue;
    if (s > pos) runs.push(new TextRun({ text: text.slice(pos, s), size: 20 }));
    runs.push(
      new TextRun({
        text: text.slice(s, e),
        size: 20,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        highlight: toDocxHighlight(h.colorTag) as any,
      }),
    );
    pos = e;
  }
  if (pos < text.length) runs.push(new TextRun({ text: text.slice(pos), size: 20 }));
  return runs.length ? runs : [new TextRun({ text, size: 20 })];
}

// ── Paragraph builders ────────────────────────────────────────────────────────

function bullet(text: string, indent = 0, highlights?: ReviewerHighlight[]): Paragraph {
  return new Paragraph({
    children: highlights?.length ? highlightedRuns(text, highlights) : [new TextRun({ text, size: 20 })],
    bullet: { level: indent },
    spacing: { after: 80 },
  });
}

function mustMemorizeBullet(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "★  ", bold: true, color: GOLD, size: 20 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new TextRun({ text, bold: true, size: 20, highlight: "yellow" as any }),
    ],
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: RED, size: 28 })],
    spacing: { before: 360, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: RED },
    },
  });
}

function label(text: string, color = BLUE): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color, allCaps: true })],
    spacing: { before: 180, after: 60 },
  });
}

function body(text: string, highlights?: ReviewerHighlight[]): Paragraph {
  return new Paragraph({
    children: highlights?.length ? highlightedRuns(text, highlights) : [new TextRun({ text, size: 20 })],
    spacing: { after: 100 },
  });
}

function noteBlock(note: ReviewerNote): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: "✎  My Notes", bold: true, color: GRAY, size: 18 }),
        ...(note.confusionLevel
          ? [new TextRun({ text: `  ·  Confusion: ${"★".repeat(note.confusionLevel)}`, color: GRAY, size: 16 })]
          : []),
      ],
      spacing: { before: 200, after: 60 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: NOTE_BORDER } },
    }),
  ];
  if (note.noteText.trim()) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: note.noteText, italics: true, color: GRAY, size: 20 })],
        spacing: { after: 160 },
        indent: { left: 360 },
      }),
    );
  }
  return paras;
}

// ── DOCX builder ──────────────────────────────────────────────────────────────

function buildDocx(
  doc: { title: string },
  reviewer: Reviewer,
  annotations?: Annotations,
  leadingPageBreak = false,
): Paragraph[] {
  const children: Paragraph[] = [];

  if (leadingPageBreak) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Cover
  children.push(
    new Paragraph({
      text: reviewer.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Source: ${doc.title}`, italics: true, color: "777777", size: 20 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: reviewer.summary, size: 22 })],
      spacing: { after: 400 },
    }),
  );

  // Topics
  for (let i = 0; i < reviewer.topics.length; i++) {
    const topic = reviewer.topics[i];
    children.push(heading2(topic.title));

    children.push(label("Core Idea"));
    children.push(body(topic.coreIdea, fieldHighlights(annotations, i, "coreIdea", 0)));

    if (topic.keyPoints.length > 0) {
      children.push(label("Key Points"));
      for (let j = 0; j < topic.keyPoints.length; j++) {
        children.push(bullet(topic.keyPoints[j], 0, fieldHighlights(annotations, i, "keyPoints", j)));
      }
    }

    if (topic.quickBreakdown.length > 0) {
      children.push(label("Quick Breakdown"));
      for (let j = 0; j < topic.quickBreakdown.length; j++) {
        children.push(bullet(topic.quickBreakdown[j], 0, fieldHighlights(annotations, i, "quickBreakdown", j)));
      }
    }

    if (topic.mustMemorize.length > 0) {
      children.push(label("Must Memorize", GOLD));
      for (const mm of topic.mustMemorize) children.push(mustMemorizeBullet(mm));
    }

    if (topic.confusedWith && topic.confusedWith.length > 0) {
      children.push(label("Don't Confuse"));
      for (const cw of topic.confusedWith) {
        children.push(bullet(`${cw.item} — ${cw.distinction}`, 0));
      }
    }

    if (topic.boardTips.length > 0) {
      children.push(label("Board Tips"));
      for (let j = 0; j < topic.boardTips.length; j++) {
        children.push(bullet(topic.boardTips[j], 0, fieldHighlights(annotations, i, "boardTips", j)));
      }
    }

    if (topic.quickRecall.length > 0) {
      children.push(label("Quick Recall"));
      for (let j = 0; j < topic.quickRecall.length; j++) {
        children.push(bullet(topic.quickRecall[j], 0, fieldHighlights(annotations, i, "quickRecall", j)));
      }
    }

    // Notes for this topic
    const note = annotations?.notes.get(i);
    if (note?.noteText.trim() || note?.confusionLevel) {
      children.push(...noteBlock(note!));
    }
  }

  // Global Must Memorize
  if (reviewer.globalMustMemorize.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Global Must-Memorize", bold: true, color: RED, size: 32 })],
        spacing: { before: 480, after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD } },
      }),
    );
    for (const item of reviewer.globalMustMemorize) children.push(mustMemorizeBullet(item));
  }

  // Mnemonics
  if (reviewer.mnemonics.length > 0) {
    children.push(
      new Paragraph({
        text: "Mnemonics",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 160 },
      }),
    );
    for (const m of reviewer.mnemonics) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${m.concept}: `, bold: true }),
            new TextRun({ text: m.aid }),
          ],
          spacing: { after: 120 },
          bullet: { level: 0 },
        }),
      );
    }
  }

  return children;
}

// ── Single-document export (GET /api/export?id=X) ────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    const collectionId = req.nextUrl.searchParams.get("collectionId");

    // ── Collection export ───────────────────────────────────────────────────
    if (collectionId) {
      const col = await getCollection(collectionId, user.id);
      if (!col) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

      const items = await listCollectionItems(collectionId, user.id);
      if (!items.length) return NextResponse.json({ error: "Collection is empty" }, { status: 400 });

      const allParagraphs: Paragraph[] = [];
      let included = 0;

      for (const item of items) {
        const doc = await getDocument(item.documentId, user.id);
        if (!doc?.reviewer) continue;

        const progression = await getProgression(item.documentId, user.id);
        if (!progression?.quizUnlocked) continue;

        const reviewer = doc.reviewer as Reviewer;
        if (!reviewer.topics || !reviewer.summary || !reviewer.globalMustMemorize) continue;

        const [notes, highlights] = await Promise.all([
          getNotesByDocument(item.documentId, user.id),
          getHighlightsByDocument(item.documentId, user.id),
        ]);
        const annotations = buildAnnotations(notes, highlights);

        const paragraphs = buildDocx(doc, reviewer, annotations, included > 0);
        allParagraphs.push(...paragraphs);
        included++;
      }

      if (included === 0) {
        return NextResponse.json(
          { error: "No unlocked documents found in this collection. Complete the quiz for each document to unlock export." },
          { status: 403 },
        );
      }

      const docx = new Document({
        title: col.name,
        description: `Collection Reviewer — ${col.name}`,
        sections: [{ children: allParagraphs }],
      });
      const buffer = await Packer.toBuffer(docx);
      const filename = `${col.name.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}_collection.docx`;

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // ── Single document export ───────────────────────────────────────────────
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const doc = await getDocument(id, user.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const progression = await getProgression(id, user.id);
    if (!progression?.quizUnlocked) {
      return NextResponse.json({ error: "Complete all sections and pass the quiz to unlock export." }, { status: 403 });
    }

    if (!doc.reviewer) {
      return NextResponse.json({ error: "No reviewer generated yet." }, { status: 404 });
    }

    const reviewer = doc.reviewer as Reviewer;
    if (!reviewer.topics || !reviewer.summary || !reviewer.globalMustMemorize) {
      return NextResponse.json(
        { error: "DOCX export is only available for standard reviewers. Adaptive reviewers cannot be exported yet." },
        { status: 422 },
      );
    }

    const [notes, highlights] = await Promise.all([
      getNotesByDocument(id, user.id),
      getHighlightsByDocument(id, user.id),
    ]);
    const annotations = buildAnnotations(notes, highlights);

    const paragraphs = buildDocx(doc, reviewer, annotations);
    const docxDoc = new Document({
      title: reviewer.title,
      description: `AI Reviewer — ${doc.title}`,
      sections: [{ children: paragraphs }],
    });
    const buffer = await Packer.toBuffer(docxDoc);
    const filename = `${doc.title.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}_reviewer.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

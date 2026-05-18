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
import {
  getDocument,
  getProgression,
  getNotesByDocument,
  getHighlightsByDocument,
  listCollectionItems,
  getCollection,
  getRecentQuizAttempts,
  getDocumentFlashcardStats,
} from "@/lib/store";
import { claude, HAIKU_MODEL } from "@/lib/claude";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { Reviewer, QuizAttempt } from "@/lib/types";
import type { ReviewerNote, ReviewerHighlight, DocumentFlashcardStats } from "@/lib/store";

export const runtime = "nodejs";

// ── Color palette ─────────────────────────────────────────────────────────────

const RED   = "C0392B";
const BLUE  = "1A5276";
const GOLD  = "7D6608";
const GRAY  = "888888";
const GREEN = "1E8449";
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

// ── Phase 8F: New export metadata types ───────────────────────────────────────

type CollectionMeta = {
  collectionName: string;
  positionLabel: string;   // "2 of 5"
  prevTitle: string | null;
  nextTitle: string | null;
};

type ExportProgressSnapshot = {
  completionPct: number;
  completedSections: number;
  totalSections: number;
  lastQuizScore: number | null;
  quizAttempts: number;
  weakTopics: string[];
  flashcard: DocumentFlashcardStats;
  masteredAt: number | null;
  notesCount: number;
  avgConfusion: number | null;
};

type ExportAISummary = {
  weakAreas: string[];
  examTraps: string[];
  retentionReminders: string[];
  suggestedFocus: string;
};

// ── Phase 8F: New paragraph builders ─────────────────────────────────────────

function collectionHeaderBlock(meta: CollectionMeta): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: "COLLECTION  ", bold: true, size: 18, color: BLUE, allCaps: true }),
        new TextRun({ text: meta.collectionName, bold: true, size: 18, color: BLUE }),
        new TextRun({ text: `   ·   ${meta.positionLabel}`, size: 16, color: GRAY }),
      ],
      spacing: { before: 0, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } },
    }),
  ];

  if (meta.prevTitle || meta.nextTitle) {
    paras.push(new Paragraph({
      children: [
        ...(meta.prevTitle
          ? [new TextRun({ text: `← ${meta.prevTitle}`, italics: true, size: 16, color: GRAY })]
          : []),
        ...(meta.prevTitle && meta.nextTitle
          ? [new TextRun({ text: "     ", size: 16 })]
          : []),
        ...(meta.nextTitle
          ? [new TextRun({ text: `${meta.nextTitle} →`, italics: true, size: 16, color: GRAY })]
          : []),
      ],
      spacing: { before: 60, after: 240 },
    }));
  }

  return paras;
}

function progressBlock(snap: ExportProgressSnapshot): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "STUDY PROGRESS SNAPSHOT", bold: true, color: BLUE, size: 18, allCaps: true })],
      spacing: { before: 200, after: 80 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
      },
    }),
  ];

  const row = (labelText: string, valueText: string, valueColor = GRAY) =>
    new Paragraph({
      children: [
        new TextRun({ text: `${labelText}  `, bold: true, size: 19, color: GRAY }),
        new TextRun({ text: valueText, size: 19, color: valueColor }),
      ],
      spacing: { before: 40, after: 40 },
      indent: { left: 180 },
    });

  const completionLine = snap.totalSections > 0
    ? `${snap.completionPct}%  (${snap.completedSections} / ${snap.totalSections} sections)`
    : "No sections tracked";
  paras.push(row("Completion:", completionLine));

  const quizLine = snap.lastQuizScore !== null
    ? `${snap.lastQuizScore}%  —  ${snap.lastQuizScore >= 95 ? "PASS ✓" : "FAIL"}  (${snap.quizAttempts} attempt${snap.quizAttempts !== 1 ? "s" : ""})`
    : "Not attempted";
  const quizColor = snap.lastQuizScore !== null && snap.lastQuizScore >= 95 ? GREEN : GRAY;
  paras.push(row("Quiz:", quizLine, quizColor));

  if (snap.flashcard.totalSessions > 0) {
    paras.push(row(
      "Flashcards:",
      `${snap.flashcard.totalCardsStudied} cards  ·  ${snap.flashcard.totalSessions} session${snap.flashcard.totalSessions !== 1 ? "s" : ""}`,
    ));
  }

  if (snap.masteredAt) {
    paras.push(row(
      "Status:",
      `MASTERED ✓  on ${new Date(snap.masteredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      GREEN,
    ));
  }

  if (snap.notesCount > 0) {
    const confStr = snap.avgConfusion !== null ? `  ·  avg confusion ${snap.avgConfusion.toFixed(1)}/5` : "";
    paras.push(row("Your Notes:", `${snap.notesCount} topic${snap.notesCount !== 1 ? "s" : ""} annotated${confStr}`));
  }

  if (snap.weakTopics.length > 0) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: "Weak Topics:", bold: true, size: 19, color: GRAY })],
      spacing: { before: 60, after: 30 },
      indent: { left: 180 },
    }));
    for (const wt of snap.weakTopics.slice(0, 5)) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: `⚠  ${wt}`, color: RED, size: 18 })],
        spacing: { after: 30 },
        indent: { left: 360 },
      }));
    }
  }

  return paras;
}

function notesOverviewBlock(notes: ReviewerNote[], reviewer: Reviewer): Paragraph[] {
  const withContent = notes.filter((n) => n.noteText.trim() || n.confusionLevel);
  if (!withContent.length) return [];

  const paras: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "MY NOTES AT A GLANCE", bold: true, color: BLUE, size: 18, allCaps: true })],
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } },
    }),
  ];

  for (const note of withContent) {
    const topicTitle = reviewer.topics[note.topicIndex]?.title ?? `Topic ${note.topicIndex + 1}`;
    paras.push(new Paragraph({
      children: [
        new TextRun({ text: topicTitle, bold: true, size: 19, color: GRAY }),
        ...(note.confusionLevel
          ? [new TextRun({ text: `  ${"★".repeat(note.confusionLevel)}`, color: RED, size: 18 })]
          : []),
      ],
      spacing: { before: 80, after: 30 },
      indent: { left: 180 },
    }));
    if (note.noteText.trim()) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: note.noteText, italics: true, size: 18, color: "888888" })],
        spacing: { after: 60 },
        indent: { left: 360 },
      }));
    }
  }

  return paras;
}

function aiSummaryBlock(summary: ExportAISummary): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      children: [new TextRun({ text: "AI STUDY COMPANION INSIGHTS", bold: true, color: BLUE, size: 26, allCaps: true })],
      spacing: { before: 0, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE } },
    }),
  ];

  const section = (title: string, items: string[], color: string) => {
    if (!items.length) return;
    paras.push(new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 22, color })],
      spacing: { before: 240, after: 80 },
    }));
    for (const item of items) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: item, size: 19 })],
        bullet: { level: 0 },
        spacing: { after: 60 },
      }));
    }
  };

  section("Weak Areas", summary.weakAreas, RED);
  section("Likely Exam Traps", summary.examTraps, GOLD);
  section("Retention Reminders", summary.retentionReminders, BLUE);

  if (summary.suggestedFocus) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: "Suggested Focus", bold: true, size: 22, color: GREEN })],
        spacing: { before: 240, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: summary.suggestedFocus, size: 19, italics: true })],
        spacing: { after: 160 },
      }),
    );
  }

  return paras;
}

// ── Phase 8F: AI summary generator (non-blocking) ─────────────────────────────

async function generateExportAISummary(
  reviewerTitle: string,
  topicTitles: string[],
  notes: ReviewerNote[],
  highlightCount: number,
  attempts: QuizAttempt[],
): Promise<ExportAISummary | null> {
  try {
    const last = attempts[0] ?? null;
    const noteLines = notes
      .filter((n) => n.noteText.trim())
      .slice(0, 6)
      .map((n) => `  topic ${n.topicIndex + 1}: "${n.noteText.slice(0, 100)}" (confusion ${n.confusionLevel ?? 0}/5)`)
      .join("\n");

    const ctx = [
      `REVIEWER: "${reviewerTitle}"`,
      `TOPICS (${topicTitles.length}): ${topicTitles.slice(0, 8).join(", ")}`,
      last
        ? `QUIZ: ${last.score}% ${last.score >= 95 ? "(PASS)" : "(FAIL)"}` +
          (last.weakTopics.length ? `\nWEAK TOPICS: ${last.weakTopics.slice(0, 5).join(", ")}` : "")
        : "QUIZ: not attempted",
      notes.length ? `STUDENT NOTES (${notes.filter(n => n.noteText.trim()).length} topics):\n${noteLines}` : "NOTES: none",
      `HIGHLIGHTS: ${highlightCount} spans marked`,
    ].join("\n");

    const res = await claude.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      system: "You are a board exam study coach. Return valid JSON only. No markdown.",
      messages: [{
        role: "user",
        content: `${ctx}\n\nReturn study insights as JSON:\n{"weakAreas":["..."],"examTraps":["..."],"retentionReminders":["..."],"suggestedFocus":"..."}`,
      }],
    }, { signal: AbortSignal.timeout(15_000) });

    const raw = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    return JSON.parse(raw) as ExportAISummary;
  } catch {
    return null; // non-critical — export works without it
  }
}

// ── DOCX builder ──────────────────────────────────────────────────────────────

function buildDocx(
  doc: { title: string },
  reviewer: Reviewer,
  annotations?: Annotations,
  leadingPageBreak = false,
  collectionMeta?: CollectionMeta,
  progressSnapshot?: ExportProgressSnapshot,
  aiSummary?: ExportAISummary,
): Paragraph[] {
  const children: Paragraph[] = [];

  if (leadingPageBreak) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Collection sequence header (before cover)
  if (collectionMeta) {
    children.push(...collectionHeaderBlock(collectionMeta));
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

  // Study progress snapshot (after cover, before topics)
  if (progressSnapshot) {
    children.push(...progressBlock(progressSnapshot));
  }

  // Notes at a glance (after progress, before topics)
  if (annotations && annotations.notes.size > 0) {
    children.push(...notesOverviewBlock([...annotations.notes.values()], reviewer));
  }

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

  // AI Study Companion Insights (at end of document)
  if (aiSummary) {
    children.push(...aiSummaryBlock(aiSummary));
  }

  return children;
}

// ── Helpers for progress snapshot ─────────────────────────────────────────────

function buildProgressSnapshot(
  progression: import("@/lib/types").DocumentProgression | null,
  docAttempts: QuizAttempt[],
  flashcard: DocumentFlashcardStats,
  notes: ReviewerNote[],
): ExportProgressSnapshot {
  const sectionStatuses = progression?.sectionStatuses ?? [];
  const totalSections = sectionStatuses.length;
  const completedSections = sectionStatuses.filter((s) => s.completed).length;
  const completionPct = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;
  const lastAttempt = docAttempts[0] ?? null;
  const notesWithContent = notes.filter((n) => n.noteText.trim() || n.confusionLevel);
  const avgConfusion = notesWithContent.length > 0
    ? notesWithContent.reduce((sum, n) => sum + (n.confusionLevel ?? 0), 0) / notesWithContent.length
    : null;

  return {
    completionPct,
    completedSections,
    totalSections,
    lastQuizScore: lastAttempt?.score ?? null,
    quizAttempts: docAttempts.length,
    weakTopics: lastAttempt?.weakTopics ?? [],
    flashcard,
    masteredAt: progression?.masteredAt ?? null,
    notesCount: notesWithContent.length,
    avgConfusion: avgConfusion !== null ? Math.round(avgConfusion * 10) / 10 : null,
  };
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

      // Pre-fetch quiz attempts once for all docs (efficient)
      const recentAttempts = await getRecentQuizAttempts(user.id, 60).catch(() => [] as QuizAttempt[]);

      const allParagraphs: Paragraph[] = [];
      const docTitles: (string | null)[] = [];

      // First pass: collect titles to build prev/next labels
      for (const item of items) {
        const doc = await getDocument(item.documentId, user.id);
        const progression = await getProgression(item.documentId, user.id);
        docTitles.push(doc && progression?.quizUnlocked && doc.reviewer ? doc.title : null);
      }

      let included = 0;
      const eligibleItems = items.filter((_, i) => docTitles[i] !== null);

      for (let ei = 0; ei < eligibleItems.length; ei++) {
        const item = eligibleItems[ei];
        const globalIdx = items.indexOf(item);

        const doc = await getDocument(item.documentId, user.id);
        if (!doc?.reviewer) continue;

        const progression = await getProgression(item.documentId, user.id);
        if (!progression?.quizUnlocked) continue;

        const reviewer = doc.reviewer as Reviewer;
        if (!reviewer.topics || !reviewer.summary || !reviewer.globalMustMemorize) continue;

        const [notes, highlights, flashcard] = await Promise.all([
          getNotesByDocument(item.documentId, user.id),
          getHighlightsByDocument(item.documentId, user.id),
          getDocumentFlashcardStats(user.id, item.documentId).catch(() => ({
            totalSessions: 0, totalCardsStudied: 0, avgQuality: null, lastSessionAt: null,
          } as import("@/lib/store").DocumentFlashcardStats)),
        ]);
        const annotations = buildAnnotations(notes, highlights);

        const docAttempts = recentAttempts.filter((a) => a.documentId === item.documentId);
        const progressSnapshot = buildProgressSnapshot(progression, docAttempts, flashcard, notes);

        // Collection sequence metadata
        const prevTitle = ei > 0 ? (docTitles[items.indexOf(eligibleItems[ei - 1])] ?? null) : null;
        const nextTitle = ei < eligibleItems.length - 1
          ? (docTitles[items.indexOf(eligibleItems[ei + 1])] ?? null)
          : null;
        const collectionMeta: CollectionMeta = {
          collectionName: col.name,
          positionLabel: `${ei + 1} of ${eligibleItems.length}`,
          prevTitle,
          nextTitle,
        };

        // AI summary (non-blocking)
        const aiSummary = await generateExportAISummary(
          reviewer.title,
          reviewer.topics.map((t) => t.title),
          notes,
          highlights.filter((h) => !h.isStale).length,
          docAttempts,
        ).catch(() => null);

        const paragraphs = buildDocx(
          doc, reviewer, annotations,
          included > 0,
          collectionMeta,
          progressSnapshot,
          aiSummary ?? undefined,
        );
        allParagraphs.push(...paragraphs);
        included++;
        void globalIdx; // suppress unused
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

    const [notes, highlights, flashcard, recentAttempts] = await Promise.all([
      getNotesByDocument(id, user.id),
      getHighlightsByDocument(id, user.id),
      getDocumentFlashcardStats(user.id, id).catch(() => ({
        totalSessions: 0, totalCardsStudied: 0, avgQuality: null, lastSessionAt: null,
      } as import("@/lib/store").DocumentFlashcardStats)),
      getRecentQuizAttempts(user.id, 20).catch(() => [] as QuizAttempt[]),
    ]);

    const annotations = buildAnnotations(notes, highlights);
    const docAttempts = recentAttempts.filter((a) => a.documentId === id);
    const progressSnapshot = buildProgressSnapshot(progression, docAttempts, flashcard, notes);

    // AI summary (non-blocking — export works without it)
    const aiSummary = await generateExportAISummary(
      reviewer.title,
      reviewer.topics.map((t) => t.title),
      notes,
      highlights.filter((h) => !h.isStale).length,
      docAttempts,
    ).catch(() => null);

    const paragraphs = buildDocx(
      doc, reviewer, annotations, false,
      undefined,
      progressSnapshot,
      aiSummary ?? undefined,
    );
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

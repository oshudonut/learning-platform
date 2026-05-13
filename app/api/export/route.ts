import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";
import { getDocument, getProgression } from "@/lib/store";
import type { Reviewer } from "@/lib/types";

function bullet(text: string, indent = 0): Paragraph {
  return new Paragraph({
    text,
    bullet: { level: indent },
    spacing: { after: 80 },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" },
    },
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
  });
}

function label(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, color: "555555" })],
    spacing: { before: 160, after: 60 },
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    text,
    spacing: { after: 100 },
  });
}

function buildDocx(doc: { title: string }, reviewer: Reviewer): Document {
  const children: Paragraph[] = [];

  // Cover
  children.push(
    new Paragraph({
      text: reviewer.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Source: ${doc.title}`,
          italics: true,
          color: "777777",
          size: 20,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: reviewer.summary, size: 22 })],
      spacing: { after: 400 },
    }),
  );

  // Topics
  for (const topic of reviewer.topics) {
    children.push(heading2(topic.title));

    children.push(label("Core Idea"));
    children.push(body(topic.coreIdea));

    if (topic.keyPoints.length > 0) {
      children.push(label("Key Points"));
      for (const kp of topic.keyPoints) children.push(bullet(kp));
    }

    if (topic.quickBreakdown.length > 0) {
      children.push(label("Quick Breakdown"));
      for (const qb of topic.quickBreakdown) children.push(bullet(qb));
    }

    if (topic.mustMemorize.length > 0) {
      children.push(label("Must Memorize"));
      for (const mm of topic.mustMemorize) children.push(bullet(`★  ${mm}`, 0));
    }

    if (topic.confusedWith && topic.confusedWith.length > 0) {
      children.push(label("Don't Confuse"));
      for (const cw of topic.confusedWith) {
        children.push(bullet(`${cw.item} — ${cw.distinction}`, 0));
      }
    }

    if (topic.boardTips.length > 0) {
      children.push(label("Board Tips"));
      for (const bt of topic.boardTips) children.push(bullet(bt));
    }

    if (topic.quickRecall.length > 0) {
      children.push(label("Quick Recall"));
      for (const qr of topic.quickRecall) children.push(bullet(qr));
    }
  }

  // Global Must Memorize
  if (reviewer.globalMustMemorize.length > 0) {
    children.push(
      new Paragraph({
        text: "Global Must-Memorize",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 160 },
      }),
    );
    for (const item of reviewer.globalMustMemorize) children.push(bullet(`★  ${item}`));
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

  return new Document({
    title: reviewer.title,
    description: `AI Reviewer — ${doc.title}`,
    sections: [{ children }],
  });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const doc = await getDocument(id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const progression = await getProgression(id);
  if (!progression?.quizUnlocked) {
    return NextResponse.json({ error: "Complete all sections and pass the quiz to unlock export." }, { status: 403 });
  }

  if (!doc.reviewer) {
    return NextResponse.json({ error: "No reviewer generated yet." }, { status: 404 });
  }

  const docx = buildDocx(doc, doc.reviewer as Reviewer);
  const buffer = await Packer.toBuffer(docx);

  const filename = `${doc.title.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}_reviewer.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

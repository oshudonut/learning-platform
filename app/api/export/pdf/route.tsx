import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { getDocument, getProgression } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import type {
  AnyReviewer,
  Reviewer,
  ConceptualReviewer,
  RetrievalReviewer,
  MemoryReviewer,
  RelationalReviewer,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Color palette ────────────────────────────────────────────────────────────

const C = {
  red:    "#C0392B",
  blue:   "#1A5276",
  gold:   "#B7770D",
  gray:   "#555555",
  green:  "#1E8449",
  orange: "#BA4A00",
  purple: "#6C3483",
  bg:     "#FAFAFA",
  border: "#DDDDDD",
  text:   "#1A1A1A",
  muted:  "#666666",
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    backgroundColor: "#FFFFFF",
    color: C.text,
  },

  // Cover
  coverTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.red, marginBottom: 8 },
  coverMethod: { fontSize: 11, color: C.blue, marginBottom: 4 },
  coverSummary: { fontSize: 10, color: C.muted, lineHeight: 1.5, marginBottom: 24 },
  coverDivider: { borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 24 },

  // Topic heading
  topicHeader: {
    backgroundColor: C.red,
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    marginTop: 20,
  },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.blue,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
    marginTop: 10,
  },
  body: { fontSize: 10, color: C.text, lineHeight: 1.5, marginBottom: 4 },
  bullet: { fontSize: 10, color: C.text, lineHeight: 1.5, marginBottom: 2 },
  bulletRow: { flexDirection: "row", marginBottom: 2 },
  dot: { width: 12, color: C.muted, fontSize: 10 },

  // Boxes
  analogyBox: {
    backgroundColor: "#F3F0FF",
    borderLeftWidth: 3,
    borderLeftColor: "#7C3AED",
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  analogyLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#6D28D9", letterSpacing: 1, marginBottom: 3 },
  recallBox: {
    backgroundColor: "#F0FDF4",
    borderLeftWidth: 3,
    borderLeftColor: C.green,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  recallLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.green, letterSpacing: 1, marginBottom: 3 },
  blurtBox: {
    backgroundColor: "#FFF7ED",
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  blurtLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.orange, letterSpacing: 1, marginBottom: 3 },
  anchorBox: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  anchorFact: { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.text, marginBottom: 3 },
  anchorDevice: { fontSize: 9, color: C.blue, fontFamily: "Helvetica-Oblique", lineHeight: 1.4 },
  priorityHigh:   { fontSize: 8, color: "#B91C1C", fontFamily: "Helvetica-Bold" },
  priorityMedium: { fontSize: 8, color: "#B45309", fontFamily: "Helvetica-Bold" },
  priorityLow:    { fontSize: 8, color: "#15803D", fontFamily: "Helvetica-Bold" },
  qaBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    marginBottom: 6,
    overflow: "hidden",
  },
  qaQuestion: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: C.text,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#F9FAFB",
  },
  qaAnswer: {
    fontSize: 10,
    color: C.text,
    paddingVertical: 5,
    paddingHorizontal: 10,
    lineHeight: 1.4,
  },
  qaHint: { fontSize: 8, color: C.muted, fontFamily: "Helvetica-Oblique" },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 3,
  },
  linkFrom: { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.text },
  linkVia:  { fontSize: 9, color: C.blue, marginHorizontal: 4, fontFamily: "Helvetica-Oblique" },
  linkTo:   { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.text },
  goldBox: {
    backgroundColor: "#FFFBEB",
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  goldLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.gold, letterSpacing: 1, marginBottom: 3 },
  pageNumber: { position: "absolute", bottom: 24, right: 48, fontSize: 8, color: C.muted },
  globalHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: C.red,
    marginTop: 24,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.gold,
    paddingBottom: 4,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children, color = C.blue }: { children: string; color?: string }) {
  return <Text style={[s.sectionLabel, { color }]}>{children.toUpperCase()}</Text>;
}

function BulletList({ items, color = C.muted }: { items: string[]; color?: string }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={[s.dot, { color }]}>•</Text>
          <Text style={s.bullet}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={[s.dot, { color: C.blue, width: 16, fontFamily: "Helvetica-Bold" }]}>{i + 1}.</Text>
          <Text style={s.bullet}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function TopicHeading({ index, title }: { index: number; title: string }) {
  return (
    <Text style={s.topicHeader}>
      {index + 1}  {title}
    </Text>
  );
}

function PageNum() {
  return (
    <Text
      style={s.pageNumber}
      render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      fixed
    />
  );
}

// ─── Cover ────────────────────────────────────────────────────────────────────

function Cover({ title, methodLabel, summary }: { title: string; methodLabel: string; summary: string }) {
  return (
    <View>
      <Text style={s.coverTitle}>{title}</Text>
      <Text style={s.coverMethod}>{methodLabel}</Text>
      <View style={s.coverDivider} />
      <Text style={s.coverSummary}>{summary}</Text>
    </View>
  );
}

// ─── Standard reviewer (board-exam) ──────────────────────────────────────────

function StandardPDF({ reviewer }: { reviewer: Reviewer }) {
  return (
    <>
      <Cover title={reviewer.title} methodLabel="Board-Exam Reviewer" summary={reviewer.summary} />

      {reviewer.topics.map((topic, i) => (
        <View key={i} wrap={false}>
          <TopicHeading index={i} title={topic.title} />
          <Text style={s.body}>{topic.coreIdea}</Text>

          {topic.keyPoints.length > 0 && (
            <><SectionLabel>Key Points</SectionLabel><BulletList items={topic.keyPoints} /></>
          )}
          {topic.quickBreakdown.length > 0 && (
            <><SectionLabel>Quick Breakdown</SectionLabel><BulletList items={topic.quickBreakdown} /></>
          )}
          {topic.mustMemorize.length > 0 && (
            <><SectionLabel color={C.gold}>Must Memorize</SectionLabel>
            {topic.mustMemorize.map((f, j) => (
              <View key={j} style={s.goldBox}>
                <Text style={s.bullet}>★  {f}</Text>
              </View>
            ))}</>
          )}
          {topic.confusedWith && topic.confusedWith.length > 0 && (
            <><SectionLabel color={C.orange}>Don't Confuse</SectionLabel>
            {topic.confusedWith.map((c, j) => (
              <View key={j} style={[s.bulletRow, { marginBottom: 3 }]}>
                <Text style={[s.bullet, { fontFamily: "Helvetica-Bold", width: 120 }]}>{c.item}</Text>
                <Text style={[s.bullet, { color: C.muted, flex: 1 }]}>{c.distinction}</Text>
              </View>
            ))}</>
          )}
          {topic.boardTips.length > 0 && (
            <><SectionLabel color={C.blue}>Board Tips</SectionLabel><BulletList items={topic.boardTips} /></>
          )}
          {topic.quickRecall.length > 0 && (
            <><SectionLabel color={C.green}>Quick Recall</SectionLabel><BulletList items={topic.quickRecall} color={C.green} /></>
          )}
        </View>
      ))}

      {reviewer.globalMustMemorize.length > 0 && (
        <View>
          <Text style={s.globalHeading}>Global Must-Memorize</Text>
          {reviewer.globalMustMemorize.map((f, i) => (
            <View key={i} style={s.goldBox}>
              <Text style={s.bullet}>★  {f}</Text>
            </View>
          ))}
        </View>
      )}

      {reviewer.mnemonics.length > 0 && (
        <View>
          <Text style={s.globalHeading}>Mnemonics</Text>
          {reviewer.mnemonics.map((m, i) => (
            <View key={i} style={s.bulletRow}>
              <Text style={[s.bullet, { fontFamily: "Helvetica-Bold", marginRight: 6 }]}>{m.concept}:</Text>
              <Text style={s.bullet}>{m.aid}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Conceptual reviewer ──────────────────────────────────────────────────────

function ConceptualPDF({ reviewer }: { reviewer: ConceptualReviewer }) {
  return (
    <>
      <Cover title={reviewer.title} methodLabel="Conceptual Reviewer" summary={reviewer.summary} />

      {reviewer.topics.map((topic, i) => (
        <View key={i} wrap={false}>
          <TopicHeading index={i} title={topic.title} />

          <View style={s.analogyBox}>
            <Text style={s.analogyLabel}>Analogy</Text>
            <Text style={[s.body, { fontFamily: "Helvetica-Oblique" }]}>{topic.analogy}</Text>
          </View>

          <SectionLabel>In Plain Terms</SectionLabel>
          <Text style={s.body}>{topic.simplifiedExplanation}</Text>

          {topic.mechanism.length > 0 && (
            <>
              <SectionLabel>How It Works</SectionLabel>
              <NumberedList items={topic.mechanism} />
            </>
          )}

          {topic.keyTakeaways.length > 0 && (
            <>
              <SectionLabel color={C.gold}>Key Takeaways</SectionLabel>
              <BulletList items={topic.keyTakeaways} color={C.gold} />
            </>
          )}

          {topic.selfCheck.length > 0 && (
            <View style={s.recallBox}>
              <Text style={s.recallLabel}>Can You Explain This Back?</Text>
              {topic.selfCheck.map((q, j) => (
                <Text key={j} style={[s.bullet, { color: "#166534" }]}>{q}</Text>
              ))}
            </View>
          )}
        </View>
      ))}

      {reviewer.bigPicture && (
        <View style={{ marginTop: 20 }}>
          <Text style={s.globalHeading}>Big Picture</Text>
          <Text style={s.body}>{reviewer.bigPicture}</Text>
        </View>
      )}
    </>
  );
}

// ─── Retrieval reviewer ───────────────────────────────────────────────────────

function RetrievalPDF({ reviewer }: { reviewer: RetrievalReviewer }) {
  return (
    <>
      <Cover title={reviewer.title} methodLabel="Active Recall Reviewer" summary={reviewer.summary} />

      {reviewer.topics.map((topic, i) => (
        <View key={i}>
          <TopicHeading index={i} title={topic.title} />

          <View style={s.blurtBox}>
            <Text style={s.blurtLabel}>Recall Challenge</Text>
            <Text style={[s.body, { color: "#9A3412" }]}>{topic.blurtPrompt}</Text>
          </View>

          <SectionLabel>Retrieval Questions</SectionLabel>
          {topic.questions.map((q, j) => (
            <View key={j} style={s.qaBox}>
              <Text style={s.qaQuestion}>{j + 1}.  {q.q}</Text>
              {q.hint && <Text style={[s.qaHint, { paddingHorizontal: 10, paddingTop: 2 }]}>Hint: {q.hint}</Text>}
              <Text style={s.qaAnswer}>{q.answer}</Text>
            </View>
          ))}

          {topic.keyFacts.length > 0 && (
            <>
              <SectionLabel color={C.gold}>Key Facts</SectionLabel>
              <BulletList items={topic.keyFacts} color={C.gold} />
            </>
          )}

          {topic.commonMistakes.length > 0 && (
            <>
              <SectionLabel color={C.orange}>Common Mistakes</SectionLabel>
              <BulletList items={topic.commonMistakes} color={C.orange} />
            </>
          )}
        </View>
      ))}

      {reviewer.finalChallenge.length > 0 && (
        <View>
          <Text style={s.globalHeading}>Final Challenge</Text>
          <NumberedList items={reviewer.finalChallenge} />
        </View>
      )}
    </>
  );
}

// ─── Memory reviewer ──────────────────────────────────────────────────────────

const priorityStyle = (p: "HIGH" | "MEDIUM" | "LOW") =>
  p === "HIGH" ? s.priorityHigh : p === "MEDIUM" ? s.priorityMedium : s.priorityLow;

function MemoryPDF({ reviewer }: { reviewer: MemoryReviewer }) {
  return (
    <>
      <Cover title={reviewer.title} methodLabel="Memory Anchors Reviewer" summary={reviewer.summary} />

      {reviewer.topics.map((topic, i) => (
        <View key={i}>
          <TopicHeading index={i} title={topic.title} />
          <Text style={[s.body, { color: C.muted, marginBottom: 6 }]}>{topic.coreIdea}</Text>

          <SectionLabel>Memory Anchors</SectionLabel>
          {topic.anchors.map((anchor, j) => (
            <View key={j} style={s.anchorBox}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <Text style={s.anchorFact}>{anchor.fact}</Text>
                <Text style={priorityStyle(anchor.priority)}>{anchor.priority}{anchor.reviewIn ? `  ·  ${anchor.reviewIn}` : ""}</Text>
              </View>
              <Text style={s.anchorDevice}>{anchor.anchor}</Text>
            </View>
          ))}

          {topic.associations.length > 0 && (
            <>
              <SectionLabel color={C.gray}>Associations</SectionLabel>
              {topic.associations.map((a, j) => (
                <View key={j} style={s.bulletRow}>
                  <Text style={[s.bullet, { fontFamily: "Helvetica-Bold", marginRight: 6, minWidth: 80 }]}>{a.concept}</Text>
                  <Text style={[s.bullet, { color: C.muted, flex: 1 }]}>{a.trick}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      ))}

      {reviewer.masterAnchors.length > 0 && (
        <View>
          <Text style={s.globalHeading}>Master Anchors — High Yield</Text>
          {reviewer.masterAnchors.map((anchor, i) => (
            <View key={i} style={[s.anchorBox, { borderColor: C.gold }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <Text style={s.anchorFact}>★  {anchor.fact}</Text>
                <Text style={priorityStyle(anchor.priority)}>{anchor.priority}</Text>
              </View>
              <Text style={s.anchorDevice}>{anchor.anchor}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Relational reviewer ──────────────────────────────────────────────────────

function RelationalPDF({ reviewer }: { reviewer: RelationalReviewer }) {
  return (
    <>
      <Cover title={reviewer.title} methodLabel="Concept Map Reviewer" summary={reviewer.summary} />

      {reviewer.topics.map((topic, i) => (
        <View key={i}>
          <TopicHeading index={i} title={topic.title} />
          <Text style={[s.body, { color: C.muted, marginBottom: 6 }]}>{topic.centralConcept}</Text>

          {topic.nodes.length > 0 && (
            <>
              <SectionLabel>Concept Web</SectionLabel>
              {topic.nodes.map((node, j) => (
                <View key={j} style={{ marginBottom: 6 }}>
                  <Text style={[s.bullet, { fontFamily: "Helvetica-Bold" }]}>◆  {node.concept}</Text>
                  {node.children.map((child, k) => (
                    <View key={k} style={[s.bulletRow, { marginLeft: 16 }]}>
                      <Text style={[s.dot, { color: C.blue }]}>→</Text>
                      <Text style={s.bullet}>{child}</Text>
                    </View>
                  ))}
                  {node.relatedTopics.length > 0 && (
                    <View style={[s.bulletRow, { marginLeft: 16 }]}>
                      <Text style={[s.dot, { color: C.muted, width: 70 }]}>Links to:</Text>
                      <Text style={[s.bullet, { color: C.blue, fontFamily: "Helvetica-Oblique" }]}>{node.relatedTopics.join(", ")}</Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {topic.crossLinks.length > 0 && (
            <>
              <SectionLabel color="#0E7490">Cross-Topic Links</SectionLabel>
              {topic.crossLinks.map((link, j) => (
                <View key={j} style={s.linkRow}>
                  <Text style={s.linkFrom}>{link.from}</Text>
                  <Text style={s.linkVia}> —[{link.via}]→ </Text>
                  <Text style={s.linkTo}>{link.to}</Text>
                </View>
              ))}
            </>
          )}

          {topic.contrastsWith.length > 0 && (
            <>
              <SectionLabel color={C.orange}>Don't Confuse With</SectionLabel>
              {topic.contrastsWith.map((c, j) => (
                <View key={j} style={[s.bulletRow, { marginBottom: 4 }]}>
                  <Text style={[s.bullet, { fontFamily: "Helvetica-Bold", marginRight: 6, minWidth: 100 }]}>{c.topic}</Text>
                  <Text style={[s.bullet, { color: C.muted, flex: 1 }]}>{c.keyDifference}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      ))}

      {reviewer.conceptMap.length > 0 && (
        <View>
          <Text style={s.globalHeading}>Full Concept Map</Text>
          {reviewer.conceptMap.map((link, i) => (
            <View key={i} style={s.linkRow}>
              <Text style={s.linkFrom}>{link.from}</Text>
              <Text style={s.linkVia}> —[{link.relationship}]→ </Text>
              <Text style={s.linkTo}>{link.to}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Root PDF document ────────────────────────────────────────────────────────

function ReviewerPDF({ reviewer }: { reviewer: AnyReviewer }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PageNum />
        {"type" in reviewer && reviewer.type === "conceptual" ? (
          <ConceptualPDF reviewer={reviewer as ConceptualReviewer} />
        ) : "type" in reviewer && reviewer.type === "retrieval" ? (
          <RetrievalPDF reviewer={reviewer as RetrievalReviewer} />
        ) : "type" in reviewer && reviewer.type === "memory" ? (
          <MemoryPDF reviewer={reviewer as MemoryReviewer} />
        ) : "type" in reviewer && reviewer.type === "relational" ? (
          <RelationalPDF reviewer={reviewer as RelationalReviewer} />
        ) : (
          <StandardPDF reviewer={reviewer as Reviewer} />
        )}
      </Page>
    </Document>
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const doc = await getDocument(id, user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const progression = await getProgression(id, user.id);
  if (!progression?.quizUnlocked) {
    return NextResponse.json(
      { error: "Complete all sections and pass the quiz to unlock export." },
      { status: 403 },
    );
  }

  if (!doc.reviewer) {
    return NextResponse.json({ error: "No reviewer generated yet." }, { status: 404 });
  }

  const buffer = await renderToBuffer(<ReviewerPDF reviewer={doc.reviewer} />);

  const filename = `${doc.title.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}_reviewer.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

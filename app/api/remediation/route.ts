import { NextRequest, NextResponse } from "next/server";
import { getLatestRemediationReviewer, saveRemediationReviewer, getDocument, getProgression, upsertProgression } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import { generateStructured } from "@/lib/claude";
import { buildRemediationPreamble, getRemediationConfig, REVIEWER_TASK, SYSTEM_PREAMBLE } from "@/lib/prompts";
import {
  ReviewerSchema,
  ConceptualReviewerSchema,
  RetrievalReviewerSchema,
  MemoryReviewerSchema,
  RelationalReviewerSchema,
} from "@/lib/types";
import type { ReviewerSchemaType } from "@/lib/types";

const SCHEMA_MAP = {
  standard: ReviewerSchema,
  conceptual: ConceptualReviewerSchema,
  retrieval: RetrievalReviewerSchema,
  memory: MemoryReviewerSchema,
  relational: RelationalReviewerSchema,
} as const satisfies Record<ReviewerSchemaType, unknown>;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, documentId } = body as { action: string; documentId: string };

    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

    if (action === "get") {
      const result = await getLatestRemediationReviewer(documentId);
      return NextResponse.json({ remediation: result });
    }

    if (action === "generate") {
      const { weakTopics } = body as { weakTopics: string[] };
      const doc = await getDocument(documentId, user.id);
      if (!doc?.reviewer) return NextResponse.json({ error: "No reviewer found" }, { status: 404 });

      // Fetch progression BEFORE generateStructured — needed for method routing AND state update
      const progression = await getProgression(documentId, user.id);
      const learningMethod = progression?.learningMethod ?? null;
      const studyMode = progression?.studyMode ?? "mastery";

      const relevantTopics = doc.reviewer.topics.filter(t =>
        weakTopics.some(weak =>
          t.title.toLowerCase().includes(weak.toLowerCase()) ||
          weak.toLowerCase().includes(t.title.toLowerCase())
        )
      );
      const topicsContent = JSON.stringify(
        relevantTopics.length > 0 ? relevantTopics : doc.reviewer.topics.slice(0, 3)
      );

      // Build method-aware task instruction and pick the matching schema.
      // getRemediationConfig routes retrieval-family methods (active_recall, blurting, sq3r, pq4r)
      // to feynman so remediation uses conceptual schema — students who failed can't do retrieval
      // of content they don't know yet.
      let taskInstruction: string;
      let schemaType: ReviewerSchemaType = "standard";
      let systemPreamble = SYSTEM_PREAMBLE;

      if (learningMethod) {
        const config = getRemediationConfig(learningMethod, studyMode);
        schemaType = config.schemaType;
        systemPreamble = config.systemPreamble;
        const preamble = buildRemediationPreamble(weakTopics, schemaType);
        taskInstruction = preamble + "\n\n" + config.taskInstruction;
      } else {
        const preamble = buildRemediationPreamble(weakTopics);
        taskInstruction = preamble + "\n\n" + REVIEWER_TASK;
      }

      const schema = SCHEMA_MAP[schemaType];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { parsed: reviewer } = await generateStructured({
        schema: schema as any,
        systemPreamble,
        documentText: topicsContent,
        taskInstruction,
        maxTokens: 2000,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await saveRemediationReviewer(documentId, weakTopics, reviewer as any);

      // Reuse the already-fetched progression — no second DB call
      if (progression) {
        progression.remediationActive = true;
        await upsertProgression(progression);
      }

      return NextResponse.json({ reviewer });
    }

    if (action === "complete") {
      const progression = await getProgression(documentId, user.id);
      if (!progression) return NextResponse.json({ error: "Progression not found" }, { status: 404 });
      progression.remediationActive = false;
      progression.remediationCompletedAt = Date.now();
      progression.quizUnlocked = true;
      await upsertProgression(progression);
      return NextResponse.json({ progression });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

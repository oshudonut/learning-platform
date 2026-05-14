import { NextRequest, NextResponse } from "next/server";
import { getLatestRemediationReviewer, saveRemediationReviewer, getDocument, getProgression, upsertProgression } from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";
import { generateStructured } from "@/lib/claude";
import { REMEDIATION_REVIEWER_TASK, SYSTEM_PREAMBLE } from "@/lib/prompts";
import { ReviewerSchema } from "@/lib/types";

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

      const relevantTopics = doc.reviewer.topics.filter(t =>
        weakTopics.some(weak =>
          t.title.toLowerCase().includes(weak.toLowerCase()) ||
          weak.toLowerCase().includes(t.title.toLowerCase())
        )
      );
      const topicsContent = JSON.stringify(
        relevantTopics.length > 0 ? relevantTopics : doc.reviewer.topics.slice(0, 3)
      );

      const taskInstruction = REMEDIATION_REVIEWER_TASK(weakTopics);
      const { parsed: reviewer } = await generateStructured({
        schema: ReviewerSchema,
        systemPreamble: SYSTEM_PREAMBLE,
        documentText: topicsContent,
        taskInstruction,
        maxTokens: 2000,
      });

      await saveRemediationReviewer(documentId, weakTopics, reviewer);

      const progression = await getProgression(documentId, user.id);
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

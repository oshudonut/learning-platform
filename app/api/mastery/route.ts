import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { randomId } from "@/lib/utils";
import type { TopicMasterySnapshot, MasteryLevel } from "@/lib/mastery-engine";

export const runtime = "nodejs";

const VALID_MASTERY_LEVELS = new Set<MasteryLevel>([
  "unfamiliar", "emerging", "understood", "mastered", "struggling",
]);

// GET /api/mastery?documentId=xxx
// Returns stored mastery snapshots for a document.
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const documentId = req.nextUrl.searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

    const { data, error } = await supabase
      .from("topic_mastery_snapshots")
      .select(
        "canonical_topic_id, topic_fingerprint, mastery_level, confidence_score, exposure_count, last_seen_at, updated_at",
      )
      .eq("user_id", user.id)
      .eq("document_id", documentId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[mastery] fetch error:", error.message);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const snapshots: TopicMasterySnapshot[] = (data ?? []).map((row) => ({
      topicId: row.canonical_topic_id as string,
      canonicalTopicId: row.canonical_topic_id as string,
      masteryLevel: row.mastery_level as MasteryLevel,
      confidenceScore: row.confidence_score as number,
      lastUpdated: row.updated_at as number,
    }));

    return NextResponse.json({ snapshots });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

type SnapshotInput = TopicMasterySnapshot & { documentId: string };

// POST /api/mastery
// Upserts computed mastery snapshots for a batch of topics.
// Body: { documentId: string, snapshots: TopicMasterySnapshot[] }
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { documentId?: string; snapshots?: unknown[] };

    if (typeof body.documentId !== "string" || !body.documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }
    if (!Array.isArray(body.snapshots) || body.snapshots.length === 0) {
      return NextResponse.json({ error: "snapshots must be a non-empty array" }, { status: 400 });
    }

    const documentId = body.documentId;
    const now = Date.now();

    const rows = (body.snapshots as SnapshotInput[])
      .filter(
        (s) =>
          s &&
          typeof s.topicId === "string" && s.topicId.length > 0 &&
          typeof s.masteryLevel === "string" && VALID_MASTERY_LEVELS.has(s.masteryLevel as MasteryLevel) &&
          typeof s.confidenceScore === "number",
      )
      .map((s) => ({
        id: randomId(),
        user_id: user.id,
        document_id: documentId,
        canonical_topic_id: s.canonicalTopicId ?? s.topicId,
        topic_fingerprint: s.canonicalTopicId?.split("--")[1] ?? null,
        mastery_level: s.masteryLevel,
        confidence_score: s.confidenceScore,
        retention_score: 0,
        exposure_count: 0,
        last_seen_at: s.lastUpdated ?? now,
        updated_at: now,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ upserted: 0 });
    }

    const { error } = await supabase
      .from("topic_mastery_snapshots")
      .upsert(rows, { onConflict: "user_id,canonical_topic_id" });

    if (error) {
      console.error("[mastery] upsert error:", error.message);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({ upserted: rows.length });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

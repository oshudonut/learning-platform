import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { LearningSignal, SignalType } from "@/lib/learning-signals";

export const runtime = "nodejs";

const MAX_BATCH = 200;

const VALID_SIGNAL_TYPES = new Set<SignalType>([
  "topic_viewed", "source_opened", "flashcard_correct", "flashcard_incorrect",
  "quiz_correct", "quiz_incorrect", "tutor_question", "note_created",
  "note_confusion_level", "rapid_recall_completed", "review_regenerated",
  "transcript_navigation",
]);

function extractFingerprint(canonicalTopicId: string | undefined): string | null {
  if (!canonicalTopicId) return null;
  const parts = canonicalTopicId.split("--");
  return parts.length === 2 ? parts[1] : null;
}

function toRow(signal: LearningSignal, userId: string) {
  return {
    id: signal.id,
    user_id: userId,
    document_id: signal.documentId,
    canonical_topic_id: signal.topicId ?? null,
    topic_fingerprint: extractFingerprint(signal.topicId),
    signal_type: signal.signalType,
    confidence: signal.confidence ?? null,
    duration_ms: signal.durationMs ?? null,
    metadata: signal.metadata ?? {},
    transcript_version: typeof signal.metadata?.transcriptVersion === "number"
      ? signal.metadata.transcriptVersion
      : null,
    transformation_id: signal.transformationId ?? null,
    created_at: signal.createdAt,
  };
}

function isValidSignal(s: unknown): s is LearningSignal {
  if (!s || typeof s !== "object") return false;
  const sig = s as Record<string, unknown>;
  return (
    typeof sig.id === "string" && sig.id.length > 0 &&
    typeof sig.documentId === "string" && sig.documentId.length > 0 &&
    typeof sig.signalType === "string" && VALID_SIGNAL_TYPES.has(sig.signalType as SignalType) &&
    typeof sig.createdAt === "number" && sig.createdAt > 0
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { signals?: unknown[] };
    if (!Array.isArray(body.signals)) {
      return NextResponse.json({ error: "signals must be an array" }, { status: 400 });
    }

    const valid = body.signals
      .slice(0, MAX_BATCH)
      .filter(isValidSignal);

    if (valid.length === 0) {
      return NextResponse.json({ inserted: 0 });
    }

    const rows = valid.map((s) => toRow(s, user.id));

    // upsert with ignoreDuplicates — makes flush idempotent on retry
    const { error } = await supabase
      .from("learning_signals")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
      console.error("[signals] insert error:", error.message);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({ inserted: valid.length });
  } catch (err) {
    console.error("[signals] unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

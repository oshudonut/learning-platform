export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getDocument, createMatch } from "@/lib/store";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await req.json() as { documentId?: string };
  if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

  const doc = await getDocument(documentId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const questions = doc.quiz?.questions;
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: "Document has no quiz questions. Generate the quiz first." }, { status: 400 });
  }

  const match = await createMatch(user.id, documentId, questions);
  return NextResponse.json({ match });
}

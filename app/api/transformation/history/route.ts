import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { listTransformationHistory } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const documentId = req.nextUrl.searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

    const history = await listTransformationHistory(documentId, user.id, 20);
    return NextResponse.json({ history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

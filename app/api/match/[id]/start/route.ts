import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getMatch, startMatch } from "@/lib/store";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const match = await getMatch(params.id);
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.hostId !== user.id) return NextResponse.json({ error: "Only the host can start" }, { status: 403 });

  await startMatch(params.id);
  const updated = await getMatch(params.id);
  return NextResponse.json({ match: updated });
}

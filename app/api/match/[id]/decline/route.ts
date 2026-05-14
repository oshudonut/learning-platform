export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getMatch, cancelMatch } from "@/lib/store";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const match = await getMatch(params.id);
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const isInvited = match.invitedUserId === user.id;
  const isHost = match.hostId === user.id;
  if (!isInvited && !isHost) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await cancelMatch(params.id);
  return NextResponse.json({ ok: true });
}

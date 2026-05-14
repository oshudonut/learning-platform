export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getMatch, getMatchParticipants, setPlayerReady, startMatch } from "@/lib/store";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const participants = await getMatchParticipants(params.id);
  const isParticipant = participants.some((p) => p.userId === user.id);
  if (!isParticipant) {
    return NextResponse.json({ error: "You must join the match before readying up" }, { status: 400 });
  }

  await setPlayerReady(params.id, user.id);

  const updatedParticipants = await getMatchParticipants(params.id);
  const allReady = updatedParticipants.length >= 2 && updatedParticipants.every((p) => p.isReady);

  if (allReady) {
    await startMatch(params.id);
  }

  const match = await getMatch(params.id);
  return NextResponse.json({ match, allReady });
}

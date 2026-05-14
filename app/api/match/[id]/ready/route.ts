export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getMatch, getMatchParticipants, setPlayerReady, startMatch } from "@/lib/store";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setPlayerReady(params.id, user.id);

  const participants = await getMatchParticipants(params.id);
  const allReady = participants.length >= 2 && participants.every((p) => p.isReady);

  if (allReady) {
    await startMatch(params.id);
  }

  const match = await getMatch(params.id);
  return NextResponse.json({ match, allReady });
}

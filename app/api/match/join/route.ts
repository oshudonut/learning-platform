export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getMatchByCode, getMatchParticipants, joinMatch } from "@/lib/store";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomCode } = await req.json() as { roomCode?: string };
  if (!roomCode) return NextResponse.json({ error: "Missing roomCode" }, { status: 400 });

  const match = await getMatchByCode(roomCode);
  if (!match) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (match.status !== "waiting") return NextResponse.json({ error: "Match already started" }, { status: 409 });

  const participants = await getMatchParticipants(match.id);

  const alreadyIn = participants.some((p) => p.userId === user.id);
  if (!alreadyIn) {
    if (participants.length >= 2) {
      return NextResponse.json({ error: "Room is full" }, { status: 409 });
    }
    await joinMatch(match.id, user.id);
  }

  return NextResponse.json({ match });
}

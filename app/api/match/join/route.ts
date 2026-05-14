export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getMatch, getMatchParticipants, joinMatch, ensureUserProfile, cancelPendingInvitationsExcept } from "@/lib/store";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { matchId } = await req.json() as { matchId?: string };
  if (!matchId) return NextResponse.json({ error: "Missing matchId" }, { status: 400 });

  await ensureUserProfile(user.id, user.email ?? "");

  const match = await getMatch(matchId);
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "waiting") return NextResponse.json({ error: "Match already started" }, { status: 409 });

  // Only the invited user may join
  if (match.invitedUserId && match.invitedUserId !== user.id) {
    return NextResponse.json({ error: "You are not invited to this match" }, { status: 403 });
  }

  const participants = await getMatchParticipants(match.id);

  const alreadyIn = participants.some((p) => p.userId === user.id);
  if (!alreadyIn) {
    if (participants.length >= 2) {
      return NextResponse.json({ error: "Room is full" }, { status: 409 });
    }
    await joinMatch(match.id, user.id);
    // Cancel all other pending invitations so stale matches don't confuse future polls
    await cancelPendingInvitationsExcept(user.id, match.id);
  }

  return NextResponse.json({ match });
}

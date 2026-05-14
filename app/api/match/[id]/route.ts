export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getMatch, getMatchParticipants, getMatchAnswers } from "@/lib/store";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const match = await getMatch(params.id);
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const [participants, answers] = await Promise.all([
    getMatchParticipants(params.id),
    getMatchAnswers(params.id),
  ]);

  return NextResponse.json({ match, participants, answers });
}

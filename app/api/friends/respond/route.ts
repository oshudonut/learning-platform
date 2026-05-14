export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { respondToFriendRequest } from "@/lib/store";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requesterId, accept } = await req.json() as { requesterId?: string; accept?: boolean };
  if (!requesterId || accept === undefined) {
    return NextResponse.json({ error: "Missing requesterId or accept" }, { status: 400 });
  }

  await respondToFriendRequest(requesterId, user.id, accept);
  return NextResponse.json({ ok: true });
}

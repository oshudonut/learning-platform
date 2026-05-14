export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getFriends, getPendingRequests, sendFriendRequest, ensureUserProfile } from "@/lib/store";

export async function GET() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [friends, pendingRequests] = await Promise.all([
    getFriends(user.id),
    getPendingRequests(user.id),
  ]);

  return NextResponse.json({ friends, pendingRequests });
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { addresseeId } = await req.json() as { addresseeId?: string };
  if (!addresseeId) return NextResponse.json({ error: "Missing addresseeId" }, { status: 400 });
  if (addresseeId === user.id) return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });

  await ensureUserProfile(user.id, user.email ?? "");
  await sendFriendRequest(user.id, addresseeId);
  return NextResponse.json({ ok: true });
}

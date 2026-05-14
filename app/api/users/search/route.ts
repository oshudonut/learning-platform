export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { searchUsers } from "@/lib/store";

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length < 2) return NextResponse.json({ users: [] });

  const users = await searchUsers(q, user.id);
  return NextResponse.json({ users });
}

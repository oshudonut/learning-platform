import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getCollection, updateCollection, deleteCollection } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const collection = await getCollection(params.id, user.id);
    if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ collection });
  } catch (err) {
    console.error("GET /api/collections/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { name?: unknown; description?: unknown; color?: unknown };
    const patch: { name?: string; description?: string | null; color?: string } = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (body.description !== undefined) {
      patch.description = typeof body.description === "string" ? body.description : null;
    }
    if (typeof body.color === "string") patch.color = body.color;

    const collection = await updateCollection(params.id, user.id, patch);
    return NextResponse.json({ collection });
  } catch (err) {
    console.error("PATCH /api/collections/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await deleteCollection(params.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/collections/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

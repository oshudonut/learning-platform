import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createCollection, listCollections } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const collections = await listCollections(user.id);
    return NextResponse.json({ collections });
  } catch (err) {
    console.error("GET /api/collections:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { name?: unknown; description?: unknown; color?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const description = typeof body.description === "string" ? body.description : null;
    const color = typeof body.color === "string" ? body.color : "blue";

    const collection = await createCollection(user.id, name, description, color);
    return NextResponse.json({ collection }, { status: 201 });
  } catch (err) {
    console.error("POST /api/collections:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

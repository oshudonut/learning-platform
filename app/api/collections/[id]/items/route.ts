import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  listCollectionItems,
  addDocumentToCollection,
  removeDocumentFromCollection,
  reorderCollectionItem,
} from "@/lib/store";
import { supabase } from "@/lib/supabase";
import type { CollectionItem } from "@/lib/store";

export const runtime = "nodejs";

type CollectionItemWithMeta = CollectionItem & {
  documentTitle: string;
  hasReviewer: boolean;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabaseServer = createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rawItems = await listCollectionItems(params.id, user.id);

    if (rawItems.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const documentIds = rawItems.map((item) => item.documentId);
    const { data: docs } = await supabase
      .from("documents")
      .select("id, title, reviewer")
      .in("id", documentIds)
      .eq("user_id", user.id);

    const docMap = new Map<string, { title: string; hasReviewer: boolean }>();
    for (const doc of docs ?? []) {
      const d = doc as Record<string, unknown>;
      docMap.set(d.id as string, {
        title: (d.title as string) ?? "",
        hasReviewer: Boolean(d.reviewer),
      });
    }

    const items: CollectionItemWithMeta[] = rawItems.map((item) => {
      const meta = docMap.get(item.documentId);
      return {
        ...item,
        documentTitle: meta?.title ?? "",
        hasReviewer: meta?.hasReviewer ?? false,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/collections/[id]/items:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabaseServer = createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { documentId?: unknown };
    const documentId = typeof body.documentId === "string" ? body.documentId : null;
    if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });

    const item = await addDocumentToCollection(params.id, documentId, user.id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message.includes("access denied") || message.includes("not found")) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    console.error("POST /api/collections/[id]/items:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabaseServer = createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { documentId?: unknown };
    const documentId = typeof body.documentId === "string" ? body.documentId : null;
    if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });

    await removeDocumentFromCollection(params.id, documentId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message.includes("access denied") || message.includes("not found")) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    console.error("DELETE /api/collections/[id]/items:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabaseServer = createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { itemId?: unknown; newPosition?: unknown };
    const itemId = typeof body.itemId === "string" ? body.itemId : null;
    const newPosition = typeof body.newPosition === "number" ? body.newPosition : null;
    if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    if (newPosition === null) return NextResponse.json({ error: "newPosition is required" }, { status: 400 });

    await reorderCollectionItem(itemId, params.id, user.id, newPosition);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message.includes("access denied") || message.includes("not found")) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    console.error("PATCH /api/collections/[id]/items:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

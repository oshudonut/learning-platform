export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  createFolder,
  listFolders,
  updateFolder,
  deleteFolder,
  moveDocumentToFolder,
  renameDocument,
} from "@/lib/store";
import { createSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const folders = await listFolders(user.id);
    return NextResponse.json({ folders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as Record<string, unknown>;
    const action = body.action as string;

    if (action === "create") {
      const folder = await createFolder(
        user.id,
        body.name as string,
        (body.color as string | undefined) ?? "blue",
      );
      return NextResponse.json({ folder });
    }

    if (action === "update") {
      const folder = await updateFolder(body.id as string, user.id, {
        name: body.name as string | undefined,
        color: body.color as string | undefined,
      });
      return NextResponse.json({ folder });
    }

    if (action === "delete") {
      await deleteFolder(body.id as string, user.id);
      return NextResponse.json({ success: true });
    }

    if (action === "move_document") {
      await moveDocumentToFolder(
        body.docId as string,
        user.id,
        (body.folderId as string | null) ?? null,
      );
      return NextResponse.json({ success: true });
    }

    if (action === "rename_document") {
      await renameDocument(body.docId as string, user.id, body.title as string);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

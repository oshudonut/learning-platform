import { NextRequest, NextResponse } from "next/server";
import { listDocuments, deleteDocument } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const docs = await listDocuments();
    return NextResponse.json({ documents: docs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    await deleteDocument(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

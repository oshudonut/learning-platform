export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPendingInvitations, getDocument } from "@/lib/store";

export async function GET() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invitations = await getPendingInvitations(user.id);

  const enriched = await Promise.all(
    invitations.map(async (inv) => {
      let documentTitle = "Untitled document";
      if (inv.documentId) {
        try {
          const doc = await getDocument(inv.documentId);
          if (doc) documentTitle = doc.title;
        } catch {
          // ignore — fallback title is fine
        }
      }
      return { ...inv, documentTitle };
    })
  );

  return NextResponse.json({ invitations: enriched });
}

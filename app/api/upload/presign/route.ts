export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabase as admin } from "@/lib/supabase";

const BUCKET = "temp-uploads";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename } = await req.json() as { filename: string };
  if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `${user.id}/${Date.now()}-${safe}`;

  // Ensure bucket exists — idempotent, ignores "already exists" error
  await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 26_214_400,
  }).catch(() => {});

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storageKey);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create upload URL" }, { status: 500 });
  }

  return NextResponse.json({ uploadUrl: data.signedUrl, storageKey });
}

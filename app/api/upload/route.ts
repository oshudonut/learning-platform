export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { extractPdfText, chunkText } from "@/lib/pdf";
import { ocrPdfWithVision, MODEL } from "@/lib/claude";
import { saveDocument, saveChunks, computeContentHash, getDocumentByContentHash } from "@/lib/store";
import { randomId } from "@/lib/utils";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabase as admin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const TEXT_STORE_CAP = 60_000;
const BUCKET = "temp-uploads";

const ACCEPTED_EXTS = new Set([".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"]);

function ext(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

async function ocrImageWithVision(buffer: Buffer, mimeType: string): Promise<string> {
  const client = new Anthropic();
  const b64 = buffer.toString("base64");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType as "image/png" | "image/jpeg" | "image/webp", data: b64 },
          },
          {
            type: "text",
            text: "Extract ALL readable text from this image. Preserve structure: headings, paragraphs, lists, tables. Return plain text only — no commentary, no markdown fences.",
          },
        ],
      },
    ],
  });
  return response.content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("\n");
}

export async function POST(req: NextRequest) {
  let resolvedKey: string | undefined;
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      storageKey: string;
      filename: string;
      ocr?: boolean;
      reviewerName?: string;
      folderId?: string;
    };

    const { storageKey, filename, ocr: forceOcr = false } = body;
    const reviewerName = body.reviewerName?.trim() || null;
    const folderId = body.folderId || null;

    if (!storageKey || !filename) {
      return NextResponse.json({ error: "storageKey and filename are required" }, { status: 400 });
    }

    // Validate ownership BEFORE setting resolvedKey — forbidden path must not clean up another user's file
    if (!storageKey.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    resolvedKey = storageKey;

    const fileExt = ext(filename);
    if (!ACCEPTED_EXTS.has(fileExt)) {
      return NextResponse.json(
        { error: `Unsupported file type. Accepted: PDF, DOCX, PNG, JPG, WEBP` },
        { status: 400 },
      );
    }

    const { data: blob, error: downloadError } = await admin.storage
      .from(BUCKET)
      .download(storageKey);

    if (downloadError || !blob) {
      return NextResponse.json({ error: "Could not retrieve uploaded file" }, { status: 500 });
    }

    const fileBytes = await blob.arrayBuffer();
    if (fileBytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(fileBytes);
    let text = "";
    let pages = 0;
    let ocrUsed = false;
    let truncated = false;

    if (fileExt === ".pdf") {
      const extracted = await extractPdfText(buffer);
      pages = extracted.pages;
      truncated = extracted.truncated;

      if (forceOcr || extracted.text.length < 200) {
        console.info("[upload] using Claude OCR for PDF");
        try {
          text = await ocrPdfWithVision(buffer.toString("base64"));
          ocrUsed = true;
        } catch (ocrErr) {
          console.error("[upload] Claude PDF OCR failed:", ocrErr);
          if (extracted.text.length < 200) {
            return NextResponse.json(
              { error: "Could not extract text. Try re-scanning at higher resolution or provide a text-based PDF." },
              { status: 422 },
            );
          }
          text = extracted.text;
        }
      } else {
        text = extracted.text;
      }
    } else if (fileExt === ".docx") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      if (text.length < 50) {
        return NextResponse.json({ error: "Could not extract text from DOCX file." }, { status: 422 });
      }
    } else {
      const mimeType = fileExt === ".png" ? "image/png" : fileExt === ".webp" ? "image/webp" : "image/jpeg";
      try {
        text = await ocrImageWithVision(buffer, mimeType);
        ocrUsed = true;
      } catch (ocrErr) {
        console.error("[upload] image OCR failed:", ocrErr);
        return NextResponse.json({ error: "Could not extract text from image." }, { status: 422 });
      }
    }

    const storedText = text.length > TEXT_STORE_CAP ? text.slice(0, TEXT_STORE_CAP) : text;
    const chunks = chunkText(text);

    const derivedTitle = filename
      .replace(/\.(pdf|docx|png|jpe?g|webp)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    const title = reviewerName ?? derivedTitle;

    // ── Duplicate detection ──────────────────────────────────────────────────
    // Compute hash from stored text (same slice the reviewer will use) and check
    // before inserting. This prevents the two-phase collision where a null-hash
    // row is inserted, then a reviewer generation attempts to stamp a hash that
    // already exists on another row for this user.
    const contentHash = computeContentHash(storedText);
    const existing = await getDocumentByContentHash(contentHash, user.id).catch(() => null);
    if (existing) {
      // CASE 1: exact duplicate — return existing document, no new row created
      return NextResponse.json({
        id: existing.id,
        title: existing.title,
        pages,
        textLength: text.length,
        chunkCount: 0,
        truncated,
        ocrUsed,
        duplicate: true,
        message: "This reviewer already exists",
      });
    }

    // CASE 4: genuine new upload — stamp hash at insert time so a future reviewer
    // generation never needs to set it (and can never trigger the constraint).
    const id = randomId();
    await saveDocument({
      id,
      title,
      filename,
      text: storedText,
      textLength: text.length,
      contentHash,
      createdAt: Date.now(),
      userId: user.id,
      folderId: folderId ?? null,
    });

    await saveChunks(id, user.id, chunks);

    return NextResponse.json({
      id,
      title,
      pages,
      textLength: text.length,
      chunkCount: chunks.length,
      truncated,
      ocrUsed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (resolvedKey) {
      admin.storage.from(BUCKET).remove([resolvedKey]).catch(() => {});
    }
  }
}

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { extractPdfText, chunkText } from "@/lib/pdf";
import { ocrPdfWithVision } from "@/lib/claude";
import { saveDocument, saveChunks } from "@/lib/store";
import { randomId } from "@/lib/utils";
import { createSupabaseServer } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const TEXT_STORE_CAP = 60_000;

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const ACCEPTED_EXTS = new Set([".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"]);

function ext(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

async function ocrImageWithVision(buffer: Buffer, mimeType: string): Promise<string> {
  const client = new Anthropic();
  const b64 = buffer.toString("base64");
  const response = await client.messages.create({
    model: "claude-opus-4-5",
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
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    const form = await req.formData();
    const file = form.get("file");
    const forceOcr = form.get("ocr") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileExt = ext(file.name);
    if (!ACCEPTED_EXTS.has(fileExt)) {
      return NextResponse.json(
        { error: `Unsupported file type. Accepted: PDF, DOCX, PNG, JPG, WEBP` },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
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
      // Image file — always use vision OCR
      const mimeType = file.type || (fileExt === ".png" ? "image/png" : fileExt === ".webp" ? "image/webp" : "image/jpeg");
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
    const id = randomId();

    const title = file.name
      .replace(/\.(pdf|docx|png|jpe?g|webp)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();

    await saveDocument({
      id,
      title,
      filename: file.name,
      text: storedText,
      textLength: text.length,
      createdAt: Date.now(),
      userId: user?.id ?? null,
    });

    await saveChunks(id, chunks);

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
  }
}

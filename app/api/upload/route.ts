import { NextRequest, NextResponse } from "next/server";
import { extractPdfText, chunkText } from "@/lib/pdf";
import { ocrPdfWithVision } from "@/lib/claude";
import { saveDocument, saveChunks } from "@/lib/store";
import { randomId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Maximum characters stored in Document.text. Downstream AI calls that need
// more context should retrieve the pre-computed chunks via getChunks() instead.
const TEXT_STORE_CAP = 60_000;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported in this MVP" },
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
    const { text: pdfText, pages, truncated } = await extractPdfText(buffer);

    let text = pdfText;
    let ocrUsed = false;

    if (text.length < 200) {
      // The PDF has too little embedded text — it is likely a scanned image.
      // Fall back to Claude's vision-based OCR before giving up.
      console.info("[upload] insufficient embedded text; falling back to Claude OCR");
      try {
        const pdfBase64 = buffer.toString("base64");
        text = await ocrPdfWithVision(pdfBase64);
        ocrUsed = true;
      } catch (ocrErr: unknown) {
        const ocrMessage =
          ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
        console.error("[upload] Claude OCR fallback failed:", ocrMessage);
        return NextResponse.json(
          {
            error:
              "Could not extract text from this PDF. " +
              "It appears to be a scanned image and OCR processing failed. " +
              "Please try re-scanning at a higher resolution or providing a text-based PDF.",
          },
          { status: 422 },
        );
      }
    }

    // Cap the stored text field. The chunks below cover the full document, so
    // AI calls that need more than TEXT_STORE_CAP characters should use
    // getChunks() rather than Document.text.
    const storedText =
      text.length > TEXT_STORE_CAP ? text.slice(0, TEXT_STORE_CAP) : text;

    // Build chunks from the full extracted text before the cap is applied.
    const chunks = chunkText(text);

    const id = randomId();

    // Persist the document first; saveChunks resolves it by id.
    await saveDocument({
      id,
      title: file.name.replace(/\.pdf$/i, ""),
      filename: file.name,
      text: storedText,
      textLength: text.length,
      createdAt: Date.now(),
    });

    await saveChunks(id, chunks);

    return NextResponse.json({
      id,
      title: file.name.replace(/\.pdf$/i, ""),
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

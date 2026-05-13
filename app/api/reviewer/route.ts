import { NextRequest, NextResponse } from "next/server";
import { generateStructured, compressDocumentForReview } from "@/lib/claude";
import { REVIEWER_TASK, SYSTEM_PREAMBLE } from "@/lib/prompts";
import { getDocument, updateDocument, computeContentHash } from "@/lib/store";
import { ReviewerSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { id, force } = (await req.json()) as { id?: string; force?: boolean };
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const doc = await getDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.reviewer && !force) {
      return NextResponse.json({ reviewer: doc.reviewer, cached: true, cacheSource: "stored" });
    }

    const incomingHash = computeContentHash(doc.text);

    if (!force && doc.contentHash === incomingHash && doc.reviewer) {
      return NextResponse.json({ reviewer: doc.reviewer, cached: true, cacheSource: "hash" });
    }

    const compressed = compressDocumentForReview(doc.text);

    const { parsed, cacheReadTokens, cacheWriteTokens } = await generateStructured({
      schema: ReviewerSchema,
      systemPreamble: SYSTEM_PREAMBLE,
      documentText: doc.text,
      compressedText: compressed,
      taskInstruction: REVIEWER_TASK,
      maxTokens: 3000,
    });

    await updateDocument(id, { reviewer: parsed, contentHash: incomingHash });

    return NextResponse.json({
      reviewer: parsed,
      cached: false,
      usage: { cacheReadTokens, cacheWriteTokens },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reviewer] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

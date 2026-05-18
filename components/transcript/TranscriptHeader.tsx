import { Clock, Eye, FileText, Hash, Zap } from "lucide-react";
import type { RawTranscript } from "@/lib/types";

const METHOD_LABELS: Record<string, string> = {
  "pdfjs-per-page":      "PDF Text",
  "claude-ocr-per-page": "Claude OCR",
  "mammoth-sections":    "DOCX Sections",
  "image-ocr":           "Image OCR",
  "claude-boundary":     "AI Segmented",
  "single-page":         "Single Page",
  "reconstructed":       "Reconstructed",
};

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(ms));
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function TranscriptHeader({ transcript }: { transcript: RawTranscript }) {
  const { meta } = transcript;
  const method = METHOD_LABELS[meta.extractionMethod] ?? meta.extractionMethod;

  return (
    <div className="rounded-xl border border-border bg-card/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">
          Source
        </span>

        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
          <FileText className="h-3 w-3" />
          {meta.pageCount} {meta.pageCount === 1 ? "page" : "pages"}
        </span>

        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
          <Hash className="h-3 w-3" />
          v{meta.version}
        </span>

        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
          <Eye className="h-3 w-3" />
          {method}
        </span>

        {meta.cached && (
          <span className="flex items-center gap-1 text-xs text-primary bg-primary/8 px-2 py-0.5 rounded-full border border-primary/20">
            <Zap className="h-3 w-3" />
            Cached
          </span>
        )}

        {meta.processingTimeMs > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            <Clock className="h-3 w-3" />
            {formatMs(meta.processingTimeMs)}
          </span>
        )}

        <span className="ml-auto text-[10px] text-muted-foreground/50">
          {formatDate(meta.generatedAt)}
        </span>
      </div>

      {meta.estimatedCostUsd > 0 && (
        <p className="text-[10px] text-muted-foreground/40 mt-1.5">
          Generation cost: ~${(meta.estimatedCostUsd * 100).toFixed(3)}¢
        </p>
      )}
    </div>
  );
}

"use client";

import { memo } from "react";
import { Clock, Cpu, Zap, Database, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils";
import type { StudyTransformation } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  reviewer: "Board Exam",
  rapid_recall: "Rapid Recall",
  conceptual: "Conceptual",
  active_recall: "Active Recall",
  flashcards: "Flashcards",
  quiz: "Quiz",
  tutor_prep: "Tutor Prep",
};

interface TransformationMetaProps {
  transformation: StudyTransformation;
  className?: string;
}

function TransformationMetaInner({ transformation: t, className }: TransformationMetaProps) {
  const totalTokens = t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens;
  const cachePercent =
    totalTokens > 0 ? Math.round(((t.cacheReadTokens + t.cacheWriteTokens) / totalTokens) * 100) : 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground/60",
        className,
      )}
    >
      {/* Type badge */}
      <span className="font-medium text-muted-foreground/80">
        {TYPE_LABELS[t.transformationType] ?? t.transformationType}
      </span>

      <span className="h-3 w-px bg-border" />

      {/* Generated / cached */}
      <span className="flex items-center gap-1">
        <Database className="h-3 w-3" />
        {formatDistanceToNow(t.generatedAt)}
      </span>

      {/* Generation time */}
      {t.generationTimeMs > 0 && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {(t.generationTimeMs / 1000).toFixed(1)}s
        </span>
      )}

      {/* Token / cost */}
      {totalTokens > 0 && (
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          {(totalTokens / 1000).toFixed(1)}k tokens
          {cachePercent > 0 && (
            <span className="text-emerald-500/70">({cachePercent}% cached)</span>
          )}
        </span>
      )}

      {/* Cost */}
      {t.estimatedCostUsd > 0 && (
        <span className="flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          ~${(t.estimatedCostUsd * 100).toFixed(2)}¢
        </span>
      )}

      {/* Transcript version */}
      <span className="flex items-center gap-1">
        <GitBranch className="h-3 w-3" />
        v{t.transcriptVersion}
      </span>

      {/* From transcript badge */}
      {Boolean(t.metadata?.fromTranscript) && (
        <span className="text-[9px] font-semibold bg-primary/10 text-primary border border-primary/15 px-1.5 py-0.5 rounded uppercase tracking-wide">
          Transcript
        </span>
      )}
    </div>
  );
}

export const TransformationMeta = memo(TransformationMetaInner);

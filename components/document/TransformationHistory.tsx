"use client";

import { useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils";
import type { StudyTransformation, StudyTransformationType } from "@/lib/types";

const TYPE_LABELS: Record<StudyTransformationType, string> = {
  reviewer: "Board Exam Reviewer",
  rapid_recall: "Rapid Recall",
  conceptual: "Conceptual",
  active_recall: "Active Recall",
  flashcards: "Flashcards",
  quiz: "Quiz",
  tutor_prep: "Tutor Prep",
};

const TYPE_COLORS: Record<StudyTransformationType, string> = {
  reviewer: "text-primary bg-primary/10",
  rapid_recall: "text-amber-500 bg-amber-500/10",
  conceptual: "text-violet-500 bg-violet-500/10",
  active_recall: "text-sky-500 bg-sky-500/10",
  flashcards: "text-emerald-500 bg-emerald-500/10",
  quiz: "text-rose-500 bg-rose-500/10",
  tutor_prep: "text-orange-500 bg-orange-500/10",
};

interface TransformationHistoryProps {
  documentId: string;
  onLoad: (transformation: StudyTransformation) => void;
  activeTransformationId?: string | null;
}

export function TransformationHistory({
  documentId,
  onLoad,
  activeTransformationId,
}: TransformationHistoryProps) {
  const [history, setHistory] = useState<StudyTransformation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/transformation/history?documentId=${documentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.history)) setHistory(data.history as StudyTransformation[]);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [documentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading history…
      </div>
    );
  }

  if (history.length === 0) return null;

  // Show only non-superseded (active) transformations, most recent first
  const active = history.filter((t) => t.supersededBy === null);
  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        <History className="h-3.5 w-3.5" />
        Generated ({active.length})
      </div>

      <div className="space-y-1.5">
        {active.map((t) => {
          const isActive = t.id === activeTransformationId;
          const colorClass = TYPE_COLORS[t.transformationType] ?? "text-muted-foreground bg-muted";

          return (
            <div
              key={t.id}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all",
                isActive
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card/40 hover:border-border/80",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap",
                  colorClass,
                )}
              >
                {TYPE_LABELS[t.transformationType] ?? t.transformationType}
              </span>

              <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                {formatDistanceToNow(t.generatedAt)}
                {t.estimatedCostUsd > 0 && (
                  <span className="ml-1.5 text-muted-foreground/50">
                    · ~${(t.estimatedCostUsd * 100).toFixed(2)}¢
                  </span>
                )}
              </span>

              {!isActive && (
                <button
                  onClick={() => onLoad(t)}
                  className="flex-shrink-0 flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium"
                  title="Load this transformation"
                >
                  <RefreshCw className="h-3 w-3" />
                  Load
                </button>
              )}

              {isActive && (
                <span className="flex-shrink-0 text-[10px] text-primary/60 font-medium">Active</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

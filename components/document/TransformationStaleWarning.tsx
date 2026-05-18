"use client";

import { memo } from "react";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TransformationStaleWarningProps {
  transformationVersion: number;
  currentVersion: number;
  onRegenerate: () => void;
  onDismiss: () => void;
}

function TransformationStaleWarningInner({
  transformationVersion,
  currentVersion,
  onRegenerate,
  onDismiss,
}: TransformationStaleWarningProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
          Transcript updated
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
          This study material was generated from transcript v{transformationVersion}.
          The transcript is now at v{currentVersion}. Regenerate to reflect the latest content.
        </p>
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            onClick={onRegenerate}
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </Button>
          <button
            className="text-xs text-amber-600/60 dark:text-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400 underline underline-offset-2"
            onClick={onDismiss}
          >
            Keep this version
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-amber-500/50 hover:text-amber-500 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export const TransformationStaleWarning = memo(TransformationStaleWarningInner);

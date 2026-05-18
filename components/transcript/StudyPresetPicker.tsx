"use client";

import { useState } from "react";
import {
  BookOpen,
  Zap,
  Brain,
  Target,
  Layers,
  CheckSquare,
  MessageSquare,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STUDY_PRESETS } from "@/lib/types";
import type { StudyPreset, PresetConfig } from "@/lib/types";

const PRESET_ICONS: Record<StudyPreset, React.ElementType> = {
  board_exam_reviewer: BookOpen,
  rapid_recall: Zap,
  conceptual_understanding: Brain,
  active_recall: Target,
  flashcards: Layers,
  quiz: CheckSquare,
  ai_tutor: MessageSquare,
};

const PRESET_COLORS: Record<StudyPreset, string> = {
  board_exam_reviewer: "text-primary bg-primary/10 border-primary/20",
  rapid_recall: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  conceptual_understanding: "text-violet-500 bg-violet-500/10 border-violet-500/20",
  active_recall: "text-sky-500 bg-sky-500/10 border-sky-500/20",
  flashcards: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  quiz: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  ai_tutor: "text-orange-500 bg-orange-500/10 border-orange-500/20",
};

interface StudyPresetPickerProps {
  onSelect: (preset: StudyPreset) => Promise<void>;
  hasTranscript?: boolean;
}

export function StudyPresetPicker({ onSelect, hasTranscript }: StudyPresetPickerProps) {
  const [activePreset, setActivePreset] = useState<StudyPreset | null>(null);

  async function handleSelect(preset: StudyPreset) {
    if (activePreset) return;
    setActivePreset(preset);
    try {
      await onSelect(preset);
    } finally {
      setActivePreset(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center pb-1">
        <h2 className="text-lg font-semibold text-foreground">Choose a Study Format</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {hasTranscript
            ? "Generated from your document's transcript — the canonical source."
            : "Select a format to generate adaptive study materials."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STUDY_PRESETS.map((config: PresetConfig) => {
          const Icon = PRESET_ICONS[config.preset];
          const colorClass = PRESET_COLORS[config.preset];
          const isLoading = activePreset === config.preset;
          const isDisabled = Boolean(activePreset) && !isLoading;

          return (
            <button
              key={config.preset}
              onClick={() => handleSelect(config.preset)}
              disabled={isDisabled || isLoading}
              className={cn(
                "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150",
                "bg-card/60 hover:bg-card border-border",
                "hover:border-border/80 hover:shadow-sm",
                isLoading && "border-primary/30 bg-primary/5",
                isDisabled && "opacity-40 cursor-not-allowed",
                !isDisabled && "cursor-pointer",
              )}
            >
              <div
                className={cn(
                  "flex-shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center",
                  colorClass,
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground leading-snug">
                    {config.label}
                  </span>
                  {config.comingSoon && (
                    <span className="text-[9px] font-semibold bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded uppercase tracking-wide">
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                  {config.description}
                </p>
                {config.estimatedMinutes > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[10px] text-muted-foreground/60">
                      ~{config.estimatedMinutes} min
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

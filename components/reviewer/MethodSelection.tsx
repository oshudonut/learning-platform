"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LearningMethod, StudyMode } from "@/lib/types";
import {
  Brain,
  Zap,
  Clock,
  BookOpen,
  Network,
  Puzzle,
  Shuffle,
  Layers,
  AlignLeft,
  ListChecks,
  BoxSelect,
  Timer,
  Mic2,
  ChevronRight,
  Loader2,
} from "lucide-react";

type MethodOption = {
  id: LearningMethod;
  label: string;
  tagline: string;
  icon: React.ElementType;
};

type ModeOption = {
  id: StudyMode;
  label: string;
  tagline: string;
  color: string;
  border: string;
  bg: string;
};

const METHODS: MethodOption[] = [
  { id: "feynman",          label: "Feynman Technique",      tagline: "Simplified explanations & analogies",    icon: Brain },
  { id: "active_recall",   label: "Active Recall",          tagline: "Retrieval-heavy with hidden answers",    icon: Zap },
  { id: "spaced_repetition",label: "Spaced Repetition",     tagline: "Priority-tagged for layered review",     icon: Clock },
  { id: "blurting",        label: "Blurting Method",        tagline: "Recall-before-reading prompts",          icon: Mic2 },
  { id: "mnemonic",        label: "Mnemonic Techniques",    tagline: "Acronyms, rhymes & memory anchors",     icon: Puzzle },
  { id: "mind_maps",       label: "Mind Mapping",           tagline: "Visual hierarchy & concept connections", icon: Network },
  { id: "interleaving",    label: "Interleaving",           tagline: "Cross-topic contrast & comparison",      icon: Shuffle },
  { id: "elaboration",     label: "Elaboration",            tagline: "Mechanisms, causes & deep WHY",         icon: Layers },
  { id: "sq3r",            label: "SQ3R Method",            tagline: "Survey → Question → Read → Recite",    icon: ListChecks },
  { id: "pq4r",            label: "PQ4R Method",            tagline: "Preview → Question → Read → Reflect",  icon: AlignLeft },
  { id: "leitner",         label: "Leitner System",         tagline: "Box-tagged recall by difficulty",        icon: BoxSelect },
  { id: "pomodoro",        label: "Pomodoro Technique",     tagline: "Chunked into 25-min study sessions",    icon: Timer },
  { id: "multisensory",    label: "Multisensory Learning",  tagline: "Verbal + visual + kinesthetic formats",  icon: BookOpen },
];

const MODES: ModeOption[] = [
  {
    id: "cram",
    label: "Cram Mode",
    tagline: "High-yield only. Fast memorization. Exam survival.",
    color: "text-red-500",
    border: "border-red-500/30",
    bg: "bg-red-500/5 hover:bg-red-500/10",
  },
  {
    id: "conceptual",
    label: "Conceptual Mode",
    tagline: "Deep understanding. Mechanisms. Long-term retention.",
    color: "text-sky-500",
    border: "border-sky-500/30",
    bg: "bg-sky-500/5 hover:bg-sky-500/10",
  },
  {
    id: "board_exam",
    label: "Board Exam Mode",
    tagline: "Clinical vignettes. Common traps. High-yield patterns.",
    color: "text-amber-500",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5 hover:bg-amber-500/10",
  },
  {
    id: "mastery",
    label: "Mastery Mode",
    tagline: "Full depth. Edge cases. Expert-level understanding.",
    color: "text-emerald-500",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5 hover:bg-emerald-500/10",
  },
];

export function MethodSelection({
  onGenerate,
}: {
  onGenerate: (method: LearningMethod, mode: StudyMode) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMethod, setSelectedMethod] = useState<LearningMethod | null>(null);
  const [selectedMode, setSelectedMode] = useState<StudyMode | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!selectedMethod || !selectedMode || generating) return;
    setGenerating(true);
    await onGenerate(selectedMethod, selectedMode);
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Brain className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Adaptive Reviewer Setup</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose how you learn and how deep you want to go. Claude will adapt the reviewer to your style.
        </p>
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                step >= s ? "bg-primary text-white" : "bg-muted text-muted-foreground",
              )}>
                {s}
              </div>
              {s < 2 && <div className={cn("h-px w-8 transition-all", step > s ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <p className="text-sm font-semibold text-foreground mb-4">Step 1 — Choose your learning method</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {METHODS.map(({ id, label, tagline, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSelectedMethod(id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                  selectedMethod === id
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/20 hover:bg-primary/5",
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                  selectedMethod === id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{tagline}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              variant="accent"
              onClick={() => setStep(2)}
              disabled={!selectedMethod}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <button
            onClick={() => setStep(1)}
            className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 transition-colors"
          >
            ← Back
          </button>
          <p className="text-sm font-semibold text-foreground mb-1">Step 2 — Choose your study mode</p>
          <p className="text-xs text-muted-foreground mb-4">
            Method: <span className="font-medium text-foreground">{METHODS.find(m => m.id === selectedMethod)?.label}</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MODES.map(({ id, label, tagline, color, border, bg }) => (
              <button
                key={id}
                onClick={() => setSelectedMode(id)}
                className={cn(
                  "rounded-xl border px-5 py-4 text-left transition-all",
                  bg, border,
                  selectedMode === id && "ring-2 ring-offset-1",
                  selectedMode === id && id === "cram" && "ring-red-500/40",
                  selectedMode === id && id === "conceptual" && "ring-sky-500/40",
                  selectedMode === id && id === "board_exam" && "ring-amber-500/40",
                  selectedMode === id && id === "mastery" && "ring-emerald-500/40",
                )}
              >
                <div className={cn("text-sm font-bold mb-1", color)}>{label}</div>
                <div className="text-xs text-muted-foreground">{tagline}</div>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              variant="accent"
              onClick={handleGenerate}
              disabled={!selectedMode || generating}
              className="px-8"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
              ) : (
                <><Zap className="h-4 w-4" />Generate Adaptive Reviewer</>
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Layers, Star, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DocumentProgression } from "@/lib/types";

// ─── Section progress bar ─────────────────────────────────────────────────────

export function SectionStepBar({
  current,
  total,
  completedCount,
}: {
  current: number;
  total: number;
  completedCount: number;
}) {
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">
          Section {current + 1}{" "}
          <span className="text-muted-foreground font-normal">of {total}</span>
        </span>
        <span className="text-sm font-medium text-primary">{pct}% complete</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="flex gap-1 mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i < completedCount
                ? "bg-primary"
                : i === current
                  ? "bg-primary/40"
                  : "bg-muted-foreground/15",
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Completion screens ───────────────────────────────────────────────────────

export function ReviewerCompleteScreen({
  topicTitles,
  onStartFlashcards,
}: {
  topicTitles: string[];
  onStartFlashcards: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center text-center py-12 gap-8"
    >
      <div className="relative">
        <div className="h-24 w-24 rounded-full bg-primary/10 ring-2 ring-primary/20 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
        </div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-amber-400 flex items-center justify-center"
        >
          <Star className="h-4 w-4 text-white" />
        </motion.div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Reviewer Complete</h2>
        <p className="text-muted-foreground max-w-sm">
          You've studied all {topicTitles.length} sections. Time to reinforce your memory with a flashcard challenge.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-secondary/40 p-4 text-left space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Topics Covered</span>
        </div>
        {topicTitles.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-success flex-shrink-0" />
            <span className="text-foreground/80">{t}</span>
          </div>
        ))}
      </div>

      <Button variant="accent" size="lg" onClick={onStartFlashcards} className="px-10">
        <Layers className="h-5 w-5" />
        Start Flashcard Challenge
        <ChevronRight className="h-4 w-4" />
      </Button>

      <p className="text-xs text-muted-foreground">Complete the flashcard challenge to unlock the Quiz</p>
    </motion.div>
  );
}

export function ReviewerAllDoneScreen() {
  return (
    <div className="flex flex-col items-center text-center py-12 gap-4">
      <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <h2 className="text-xl font-bold text-foreground">All Done</h2>
      <p className="text-muted-foreground">
        Reviewer and flashcard challenge complete. Quiz is now unlocked.
      </p>
    </div>
  );
}

// ─── useProgressionState hook ─────────────────────────────────────────────────

export function useProgressionState(totalTopics: number, progression?: DocumentProgression) {
  const completedCount = progression?.sectionStatuses.filter((s) => s.completed).length ?? 0;
  const allComplete = completedCount === totalTopics && totalTopics > 0;
  const serverIdx = progression?.currentSectionIndex ?? 0;
  const [localIdx, setLocalIdx] = useState<number>(serverIdx);
  const [completing, setCompleting] = useState(false);
  const displayIdx = Math.max(localIdx, serverIdx);
  const currentIdx = Math.min(displayIdx, totalTopics - 1);

  return { completedCount, allComplete, currentIdx, completing, setCompleting, setLocalIdx };
}

// ─── Slide animation wrapper ──────────────────────────────────────────────────

export function SectionSlide({
  idx,
  children,
}: {
  idx: number;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={idx}
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -32 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Mark complete button ─────────────────────────────────────────────────────

export function MarkCompleteButton({
  isLast,
  completing,
  onClick,
}: {
  isLast: boolean;
  completing: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="accent"
      className="w-full h-12 text-base"
      onClick={onClick}
      disabled={completing}
    >
      {completing ? (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white"
          />
          Saving…
        </>
      ) : isLast ? (
        <>
          <CheckCircle2 className="h-5 w-5" />
          Complete Reviewer
          <ChevronRight className="h-4 w-4" />
        </>
      ) : (
        <>
          <CheckCircle2 className="h-5 w-5" />
          Mark Complete &amp; Continue
          <ChevronRight className="h-4 w-4" />
        </>
      )}
    </Button>
  );
}

// ─── Completed sections list ──────────────────────────────────────────────────

export function CompletedSectionsList({
  completedCount,
  topics,
  currentIdx,
}: {
  completedCount: number;
  topics: { title: string }[];
  currentIdx: number;
}) {
  if (completedCount === 0) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Completed ({completedCount})
        </span>
      </div>
      <div className="space-y-1.5">
        {topics.slice(0, currentIdx).map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
            {t.title}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Target,
  CheckSquare,
  AlertTriangle,
  HelpCircle,
  Zap,
  CheckCircle2,
  ChevronRight,
  Layers,
  Sparkles,
  Star,
  Lightbulb,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Reviewer, ReviewerTopic, DocumentProgression } from "@/lib/types";

function TopicContent({ topic }: { topic: ReviewerTopic }) {
  return (
    <div className="space-y-5">
      {topic.keyPoints.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Key Points</span>
          </div>
          <ul className="space-y-2">
            {topic.keyPoints.map((pt, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-foreground/85">{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topic.quickBreakdown.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Breakdown</span>
          </div>
          <ul className="space-y-2">
            {topic.quickBreakdown.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topic.mustMemorize.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Target className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Must Memorize</span>
          </div>
          <ul className="space-y-2">
            {topic.mustMemorize.map((fact, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-400">
                  {i + 1}
                </span>
                <span className="text-foreground/85">{fact}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topic.confusedWith && topic.confusedWith.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">Confused With</span>
          </div>
          <div className="space-y-2">
            {topic.confusedWith.map((row, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-orange-500/15 bg-orange-500/5 px-3 py-2 text-sm">
                <span className="font-semibold text-foreground flex-shrink-0">{row.item}</span>
                <span className="text-muted-foreground/80 border-l border-orange-500/20 pl-3">{row.distinction}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topic.boardTips.length > 0 && (
        <div className="border-l-2 border-sky-600/50 pl-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <CheckSquare className="h-3.5 w-3.5 text-sky-700" />
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">Board Tips</span>
          </div>
          <ul className="space-y-1.5">
            {topic.boardTips.map((tip, i) => (
              <li key={i} className="text-sm text-foreground/80">{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {topic.quickRecall.length > 0 && (
        <div className="rounded-lg border border-emerald-600/25 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <HelpCircle className="h-3.5 w-3.5 text-emerald-700" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Quick Recall</span>
          </div>
          <ul className="space-y-1.5">
            {topic.quickRecall.map((q, i) => (
              <li key={i} className="text-sm text-emerald-900 font-medium">{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionStepBar({
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

function ReviewerCompleteScreen({
  reviewer,
  onStartFlashcards,
}: {
  reviewer: Reviewer;
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
          You&apos;ve studied all {reviewer.topics.length} sections. Time to reinforce your memory with a flashcard challenge.
        </p>
      </div>

      {/* Quick summary of topics covered */}
      <div className="w-full max-w-sm rounded-xl border border-border bg-secondary/40 p-4 text-left space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Topics Covered</span>
        </div>
        {reviewer.topics.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-success flex-shrink-0" />
            <span className="text-foreground/80">{t.title}</span>
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

export function ReviewerView({
  reviewer,
  progression,
  onSectionComplete,
  onStartFlashcards,
}: {
  reviewer: Reviewer;
  progression?: DocumentProgression;
  documentId?: string;
  onSectionComplete?: (index: number) => void;
  onStartFlashcards?: () => void;
}) {
  const total = reviewer.topics.length;
  const completedCount = progression?.sectionStatuses.filter((s) => s.completed).length ?? 0;
  const allComplete = completedCount === total && total > 0;

  // Prefer server-tracked index so refreshes land on the right section
  const serverIdx = progression?.currentSectionIndex ?? 0;
  const [localIdx, setLocalIdx] = useState<number>(serverIdx);
  const [completing, setCompleting] = useState(false);

  // Always respect the further of server vs local (server wins on refresh)
  const displayIdx = Math.max(localIdx, serverIdx);
  const currentIdx = Math.min(displayIdx, total - 1);

  // All sections done but flashcard challenge not yet taken
  if (allComplete && !progression?.flashcardChallengeCompleted) {
    return (
      <ReviewerCompleteScreen
        reviewer={reviewer}
        onStartFlashcards={() => onStartFlashcards?.()}
      />
    );
  }

  // Fully done (sections + flashcard challenge)
  if (allComplete && progression?.flashcardChallengeCompleted) {
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

  const topic = reviewer.topics[currentIdx];
  if (!topic) return null;

  async function handleMarkComplete() {
    if (completing) return;
    setCompleting(true);
    await onSectionComplete?.(currentIdx);
    // Optimistically advance the local index while the server request resolves
    if (currentIdx < total - 1) {
      setLocalIdx(currentIdx + 1);
    }
    setCompleting(false);
  }

  return (
    <div className="animate-fade-up">
      <SectionStepBar current={currentIdx} total={total} completedCount={completedCount} />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -32 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="space-y-6"
        >
          {/* Section header */}
          <div className="rounded-xl border-2 border-primary/25 bg-primary/5 px-6 py-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary flex-shrink-0">
                  {currentIdx + 1}
                </div>
                <h3 className="font-semibold text-foreground text-lg leading-snug">{topic.title}</h3>
              </div>
              <Badge variant="medium" className="flex-shrink-0">Active</Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{topic.coreIdea}</p>
          </div>

          {/* Topic content */}
          <div className="rounded-xl border border-border bg-card p-6">
            <TopicContent topic={topic} />
          </div>

          {/* Mark complete CTA */}
          <Button
            variant="accent"
            className="w-full h-12 text-base"
            onClick={handleMarkComplete}
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
            ) : currentIdx === total - 1 ? (
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

          {/* Completed sections list (collapsed, subtle) */}
          {completedCount > 0 && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Completed ({completedCount})
                </span>
              </div>
              <div className="space-y-1.5">
                {reviewer.topics.slice(0, currentIdx).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
                    {t.title}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global Must Memorize — shown only on the last section */}
          {currentIdx === total - 1 && reviewer.globalMustMemorize.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-foreground">Global Must Memorize</h3>
                <Badge variant="warning" className="ml-auto">High Yield</Badge>
              </div>
              <ul className="space-y-2.5">
                {reviewer.globalMustMemorize.map((fact, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-400">
                      {i + 1}
                    </span>
                    <span className="text-foreground/85">{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mnemonics — shown only on the last section */}
          {currentIdx === total - 1 && reviewer.mnemonics.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">Memory Aids</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {reviewer.mnemonics.map((m, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Star className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span className="text-xs font-semibold text-foreground">{m.concept}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pl-5">{m.aid}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

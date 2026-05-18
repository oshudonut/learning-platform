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
  Timer,
  Network,
  Repeat,
  GitBranch,
  Eye,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnyReviewer, Reviewer, ReviewerTopic, DocumentProgression, LearningMethod, StudyMode } from "@/lib/types";
import { METHOD_CONFIG, type MethodConfig } from "@/lib/learning-methods";
import { ConceptualReviewerView } from "./views/ConceptualReviewerView";
import { RetrievalReviewerView } from "./views/RetrievalReviewerView";
import { MemoryReviewerView } from "./views/MemoryReviewerView";
import { RelationalReviewerView } from "./views/RelationalReviewerView";
import { BoardExamTopicRenderer } from "./board-exam/BoardExamTopicRenderer";
import type { ReviewerHighlight } from "@/lib/store";

const STUDY_MODE_BADGE: Record<StudyMode, { label: string; cls: string }> = {
  cram:       { label: "Cram", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  conceptual: { label: "Conceptual", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  board_exam: { label: "Board Exam", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  mastery:    { label: "Mastery", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

function LeitnerBadge({ fact }: { fact: string }) {
  const match = fact.match(/^\[(Box\s*\d)\]/i);
  if (!match) return <span className="text-foreground/85">{fact}</span>;
  const box = match[1].replace(/\s+/, " ");
  const colors: Record<string, string> = {
    "Box 1": "bg-red-500/15 text-red-400",
    "Box 2": "bg-amber-500/15 text-amber-400",
    "Box 3": "bg-emerald-500/15 text-emerald-400",
  };
  const cls = colors[box] ?? "bg-muted text-muted-foreground";
  const rest = fact.replace(/^\[Box\s*\d\]\s*/i, "");
  return (
    <span className="flex items-center gap-2">
      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0", cls)}>{box}</span>
      <span className="text-foreground/85">{rest}</span>
    </span>
  );
}

function SpacedRepFact({ fact }: { fact: string }) {
  const match = fact.match(/^(HIGH|MEDIUM|LOW)\b/i);
  if (!match) return <span className="text-foreground/85">{fact}</span>;
  const priority = match[1].toUpperCase();
  const colors: Record<string, string> = {
    HIGH: "bg-red-500/15 text-red-400",
    MEDIUM: "bg-amber-500/15 text-amber-400",
    LOW: "bg-emerald-500/15 text-emerald-400",
  };
  const rest = fact.replace(/^(HIGH|MEDIUM|LOW)\s*/i, "");
  return (
    <span className="flex items-center gap-2">
      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0", colors[priority])}>{priority}</span>
      <span className="text-foreground/85">{rest}</span>
    </span>
  );
}

function TopicContent({ topic, config, method }: { topic: ReviewerTopic; config: MethodConfig; method?: LearningMethod }) {
  const quickRecallBlock = topic.quickRecall.length > 0 && (
    <div className="rounded-lg border border-emerald-600/25 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        <HelpCircle className="h-3.5 w-3.5 text-emerald-700" />
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{config.quickRecallLabel}</span>
      </div>
      <ul className="space-y-1.5">
        {topic.quickRecall.map((q, i) => (
          <li key={i} className="text-sm text-emerald-900 dark:text-emerald-300 font-medium">{q}</li>
        ))}
      </ul>
    </div>
  );

  const confusedWithBlock = topic.confusedWith && topic.confusedWith.length > 0 && (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">{config.confusedWithLabel}</span>
      </div>
      <div className="space-y-2">
        {topic.confusedWith.map((row, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-orange-500/15 bg-orange-500/5 px-3 py-2 text-sm">
            <span className="font-semibold text-foreground flex-shrink-0">{row.item}</span>
            {method === "mind_maps" ? (
              <span className="flex items-center gap-1 text-muted-foreground/80 border-l border-orange-500/20 pl-3">
                <ArrowRight className="h-3 w-3 flex-shrink-0" />{row.distinction}
              </span>
            ) : (
              <span className="text-muted-foreground/80 border-l border-orange-500/20 pl-3">{row.distinction}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const keyPointsBlock = topic.keyPoints.length > 0 && (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        {method === "mind_maps" ? <Network className="h-3.5 w-3.5 text-primary" /> :
         method === "elaboration" ? <GitBranch className="h-3.5 w-3.5 text-primary" /> :
         <Brain className="h-3.5 w-3.5 text-primary" />}
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">{config.keyPointsLabel}</span>
      </div>
      <ul className="space-y-2">
        {topic.keyPoints.map((pt, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            {method === "mind_maps" ? (
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
            ) : (
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            )}
            <span className="text-foreground/85">{pt}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const quickBreakdownBlock = topic.quickBreakdown.length > 0 && (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        {method === "feynman" ? <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" /> :
         method === "multisensory" ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> :
         method === "pomodoro" ? <Timer className="h-3.5 w-3.5 text-muted-foreground" /> :
         <Zap className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{config.quickBreakdownLabel}</span>
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
  );

  const mustMemorizeBlock = topic.mustMemorize.length > 0 && (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        {method === "spaced_repetition" ? <Repeat className="h-3.5 w-3.5 text-amber-400" /> :
         <Target className="h-3.5 w-3.5 text-amber-400" />}
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">{config.mustMemorizeLabel}</span>
      </div>
      <ul className="space-y-2">
        {topic.mustMemorize.map((fact, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-400">
              {i + 1}
            </span>
            {method === "leitner" ? <LeitnerBadge fact={fact} /> :
             method === "spaced_repetition" ? <SpacedRepFact fact={fact} /> :
             <span className="text-foreground/85">{fact}</span>}
          </li>
        ))}
      </ul>
    </div>
  );

  const boardTipsBlock = topic.boardTips.length > 0 && (
    <div className="border-l-2 border-sky-600/50 pl-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        {method === "pomodoro" ? <Timer className="h-3.5 w-3.5 text-sky-700" /> :
         <CheckSquare className="h-3.5 w-3.5 text-sky-700" />}
        <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">{config.boardTipsLabel}</span>
      </div>
      <ul className="space-y-1.5">
        {topic.boardTips.map((tip, i) => (
          <li key={i} className="text-sm text-foreground/80">{tip}</li>
        ))}
      </ul>
    </div>
  );

  // Compose section order based on method config
  if (config.quickRecallFirst) {
    return (
      <div className="space-y-5">
        {quickRecallBlock}
        {config.confusedWithFirst ? confusedWithBlock : null}
        {keyPointsBlock}
        {quickBreakdownBlock}
        {mustMemorizeBlock}
        {!config.confusedWithFirst ? confusedWithBlock : null}
        {boardTipsBlock}
      </div>
    );
  }

  if (config.confusedWithFirst) {
    return (
      <div className="space-y-5">
        {confusedWithBlock}
        {keyPointsBlock}
        {quickBreakdownBlock}
        {mustMemorizeBlock}
        {boardTipsBlock}
        {quickRecallBlock}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {keyPointsBlock}
      {quickBreakdownBlock}
      {mustMemorizeBlock}
      {confusedWithBlock}
      {boardTipsBlock}
      {quickRecallBlock}
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

type NoteData = { noteText: string; confusionLevel: number | null };

export function ReviewerView({
  reviewer,
  progression,
  documentId,
  learningMethod,
  studyMode,
  notes,
  highlights,
  onHighlightCreated,
  onHighlightDeleted,
  onSectionComplete,
  onStartFlashcards,
}: {
  reviewer: AnyReviewer;
  progression?: DocumentProgression;
  documentId?: string;
  learningMethod?: LearningMethod | null;
  studyMode?: StudyMode | null;
  notes?: Map<number, NoteData>;
  highlights?: ReviewerHighlight[];
  onHighlightCreated?: (h: ReviewerHighlight) => void;
  onHighlightDeleted?: (id: string) => void;
  onSectionComplete?: (index: number) => void;
  onStartFlashcards?: () => void;
}) {
  // Dispatch to methodology-specific viewers based on reviewer type
  if ("type" in reviewer) {
    const sharedProps = { progression, learningMethod, studyMode, documentId, notes, onSectionComplete, onStartFlashcards };
    if (reviewer.type === "conceptual") {
      return <ConceptualReviewerView reviewer={reviewer} {...sharedProps} />;
    }
    if (reviewer.type === "retrieval") {
      return <RetrievalReviewerView reviewer={reviewer} {...sharedProps} />;
    }
    if (reviewer.type === "memory") {
      return <MemoryReviewerView reviewer={reviewer} {...sharedProps} />;
    }
    if (reviewer.type === "relational") {
      return <RelationalReviewerView reviewer={reviewer} {...sharedProps} />;
    }
  }

  // Standard reviewer (legacy / board-exam style)
  const standardReviewer = reviewer as Reviewer;
  const total = standardReviewer.topics.length;
  const completedCount = progression?.sectionStatuses.filter((s) => s.completed).length ?? 0;
  const allComplete = completedCount === total && total > 0;

  const resolvedMethod = learningMethod ?? progression?.learningMethod ?? null;
  const resolvedMode = studyMode ?? progression?.studyMode ?? null;
  const config = resolvedMethod ? METHOD_CONFIG[resolvedMethod] : null;

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
        reviewer={standardReviewer}
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

  const topic = standardReviewer.topics[currentIdx];
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
      {/* Method + mode badges */}
      {(config || resolvedMode) && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {config && (
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", config.accentClass)}>
              {config.badge}
            </span>
          )}
          {resolvedMode && (
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", STUDY_MODE_BADGE[resolvedMode].cls)}>
              {STUDY_MODE_BADGE[resolvedMode].label}
            </span>
          )}
        </div>
      )}

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
          {/* Section header — flat academic style */}
          <div className="pb-3 border-b border-muted-foreground/15">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <h3 className="font-extrabold text-red-600 dark:text-red-500 uppercase tracking-wide text-base leading-tight">
                {currentIdx + 1}. {topic.title}
              </h3>
              <Badge variant="medium" className="flex-shrink-0">Active</Badge>
            </div>
            {config?.hint && (
              <div className="mt-2 border-l-2 border-muted-foreground/20 pl-3">
                <p className="text-xs text-muted-foreground italic">{config.hint}</p>
              </div>
            )}
            {config?.blurtChallenge && (
              <div className="mt-2 border-l-2 border-orange-400/50 pl-3">
                <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider mb-0.5">Blurt Challenge</p>
                <p className="text-xs text-muted-foreground">Close this screen for 60 seconds. Write or say everything you know about <strong>{topic.title}</strong>. Then come back and check.</p>
              </div>
            )}
          </div>

          {/* Topic content */}
          <BoardExamTopicRenderer
            topic={topic}
            isLastSection={currentIdx === total - 1}
            globalMustMemorize={standardReviewer.globalMustMemorize}
            mnemonics={standardReviewer.mnemonics}
            documentId={documentId}
            topicIndex={currentIdx}
            note={notes?.get(currentIdx) ?? null}
            studyMode={resolvedMode ?? undefined}
            highlights={highlights?.filter((h) => h.topicIndex === currentIdx)}
            onHighlightCreated={onHighlightCreated}
            onHighlightDeleted={onHighlightDeleted}
          />

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
                {standardReviewer.topics.slice(0, currentIdx).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
                    {t.title}
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

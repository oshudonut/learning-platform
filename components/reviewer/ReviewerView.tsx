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
import { ConceptualReviewerView } from "./views/ConceptualReviewerView";
import { RetrievalReviewerView } from "./views/RetrievalReviewerView";
import { MemoryReviewerView } from "./views/MemoryReviewerView";
import { RelationalReviewerView } from "./views/RelationalReviewerView";

// ─── Per-method display configuration ────────────────────────────────────────

type MethodConfig = {
  badge: string;
  accentClass: string; // tailwind bg+text classes for the badge chip
  keyPointsLabel: string;
  quickBreakdownLabel: string;
  mustMemorizeLabel: string;
  boardTipsLabel: string;
  quickRecallLabel: string;
  confusedWithLabel: string;
  hint?: string;
  quickRecallFirst?: boolean;
  confusedWithFirst?: boolean;
  blurtChallenge?: boolean;
};

const METHOD_CONFIG: Record<LearningMethod, MethodConfig> = {
  feynman: {
    badge: "Feynman Technique",
    accentClass: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    keyPointsLabel: "In Plain Terms",
    quickBreakdownLabel: "Simple Analogy",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Easy Mix-ups",
    hint: "Could you explain this to a 12-year-old? Read each section and try.",
  },
  active_recall: {
    badge: "Active Recall",
    accentClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Recall First",
    confusedWithLabel: "Don't Confuse",
    hint: "Try to answer the recall questions before reading the rest of the section.",
    quickRecallFirst: true,
  },
  spaced_repetition: {
    badge: "Spaced Repetition",
    accentClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Review Notes",
    mustMemorizeLabel: "Review Priority",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Recall Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Items tagged HIGH should be reviewed again tomorrow. MEDIUM in 3 days. LOW in 7 days.",
  },
  blurting: {
    badge: "Blurting",
    accentClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Fill in the Blanks",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Recall Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Before reading — close your eyes and write down everything you know about this topic.",
    blurtChallenge: true,
  },
  mind_maps: {
    badge: "Mind Mapping",
    accentClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    keyPointsLabel: "Concept Nodes",
    quickBreakdownLabel: "Relationships",
    mustMemorizeLabel: "Core Facts",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Branch Distinctions",
    hint: "As you read, sketch the connections between concepts on paper.",
  },
  mnemonic: {
    badge: "Mnemonics",
    accentClass: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Memory Hooks",
    boardTipsLabel: "Exam Tricks",
    quickRecallLabel: "Recall Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Each memory hook includes an acronym, rhyme, or vivid image. Test if they stick.",
  },
  interleaving: {
    badge: "Interleaving",
    accentClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Compare Topics",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Mix-up Alert",
    hint: "Notice how this topic connects to and differs from others in the material.",
    confusedWithFirst: true,
  },
  elaboration: {
    badge: "Elaboration",
    accentClass: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    keyPointsLabel: "Mechanisms",
    quickBreakdownLabel: "Why It Works",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Don't Confuse",
    hint: "For each point, ask yourself: why does this happen? What's the mechanism?",
  },
  sq3r: {
    badge: "SQ3R",
    accentClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    keyPointsLabel: "Read",
    quickBreakdownLabel: "Survey",
    mustMemorizeLabel: "Recite",
    boardTipsLabel: "Review",
    quickRecallLabel: "Question",
    confusedWithLabel: "Don't Confuse",
    hint: "Follow the SQ3R flow: Survey → Question → Read → Recite → Review.",
    quickRecallFirst: true,
  },
  pq4r: {
    badge: "PQ4R",
    accentClass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    keyPointsLabel: "Read",
    quickBreakdownLabel: "Reflect",
    mustMemorizeLabel: "Recite",
    boardTipsLabel: "Review",
    quickRecallLabel: "Question",
    confusedWithLabel: "Don't Confuse",
    hint: "Follow the PQ4R flow: Preview → Question → Read → Reflect → Recite → Review.",
    quickRecallFirst: true,
  },
  leitner: {
    badge: "Leitner System",
    accentClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Leitner Cards",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Don't Confuse",
    hint: "Box 1 = review daily. Box 2 = every 3 days. Box 3 = once a week.",
  },
  pomodoro: {
    badge: "Pomodoro",
    accentClass: "bg-red-500/10 text-red-400 border-red-500/20",
    keyPointsLabel: "Key Points",
    quickBreakdownLabel: "Breakdown",
    mustMemorizeLabel: "Must Memorize",
    boardTipsLabel: "5-Min Review",
    quickRecallLabel: "End of Session Check",
    confusedWithLabel: "Don't Confuse",
    hint: "Set a 25-minute timer. Focus on this section only. Review at the end.",
  },
  multisensory: {
    badge: "Multisensory",
    accentClass: "bg-lime-500/10 text-lime-400 border-lime-500/20",
    keyPointsLabel: "Read & Speak",
    quickBreakdownLabel: "Visualize",
    mustMemorizeLabel: "Write It Out",
    boardTipsLabel: "Exam Tips",
    quickRecallLabel: "Test Yourself",
    confusedWithLabel: "Don't Confuse",
    hint: "Read aloud, sketch a diagram, then write key facts from memory.",
  },
};

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

export function ReviewerView({
  reviewer,
  progression,
  learningMethod,
  studyMode,
  onSectionComplete,
  onStartFlashcards,
}: {
  reviewer: AnyReviewer;
  progression?: DocumentProgression;
  documentId?: string;
  learningMethod?: LearningMethod | null;
  studyMode?: StudyMode | null;
  onSectionComplete?: (index: number) => void;
  onStartFlashcards?: () => void;
}) {
  // Dispatch to methodology-specific viewers based on reviewer type
  if ("type" in reviewer) {
    const sharedProps = { progression, learningMethod, studyMode, onSectionComplete, onStartFlashcards };
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
            {/* Method-specific hint shown once per section */}
            {config?.hint && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-background/60 border border-border px-3 py-2">
                <Lightbulb className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground italic">{config.hint}</p>
              </div>
            )}
            {/* Blurt challenge prompt */}
            {config?.blurtChallenge && (
              <div className="mt-3 rounded-lg border border-orange-500/25 bg-orange-500/5 px-3 py-2">
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">Blurt Challenge</p>
                <p className="text-xs text-muted-foreground">Close this screen for 60 seconds. Write or say everything you know about <strong>{topic.title}</strong>. Then come back and check.</p>
              </div>
            )}
          </div>

          {/* Topic content */}
          <div className="rounded-xl border border-border bg-card p-6">
            <TopicContent topic={topic} config={config ?? METHOD_CONFIG.feynman} method={resolvedMethod ?? undefined} />
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
                {standardReviewer.topics.slice(0, currentIdx).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
                    {t.title}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global Must Memorize — shown only on the last section */}
          {currentIdx === total - 1 && standardReviewer.globalMustMemorize.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-foreground">Global Must Memorize</h3>
                <Badge variant="warning" className="ml-auto">High Yield</Badge>
              </div>
              <ul className="space-y-2.5">
                {standardReviewer.globalMustMemorize.map((fact, i) => (
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
          {currentIdx === total - 1 && standardReviewer.mnemonics.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">Memory Aids</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {standardReviewer.mnemonics.map((m, i) => (
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

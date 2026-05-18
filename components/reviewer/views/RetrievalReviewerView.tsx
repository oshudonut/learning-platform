"use client";

import { useState } from "react";
import { Brain, ChevronDown, AlertTriangle, CheckSquare, Target, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RetrievalReviewer, RetrievalQuestion, DocumentProgression, LearningMethod, StudyMode } from "@/lib/types";
import {
  SectionStepBar,
  SectionSlide,
  MarkCompleteButton,
  CompletedSectionsList,
  ReviewerCompleteScreen,
  ReviewerAllDoneScreen,
  useProgressionState,
} from "../shared";
import { WorkspacePanel } from "@/components/reviewer/WorkspacePanel";

const METHOD_BADGE: Record<string, { label: string; cls: string }> = {
  active_recall: { label: "Active Recall", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  blurting:      { label: "Blurting",       cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  sq3r:          { label: "SQ3R",           cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  pq4r:          { label: "PQ4R",           cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

const STUDY_MODE_BADGE: Record<string, { label: string; cls: string }> = {
  cram:       { label: "Cram",       cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  conceptual: { label: "Conceptual", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  board_exam: { label: "Board Exam", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  mastery:    { label: "Mastery",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

function RetrievalQuestionCard({ q, index }: { q: RetrievalQuestion; index: number }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <p className="text-sm font-medium text-foreground">{q.q}</p>
        </div>
        {q.hint && !revealed && (
          <p className="text-xs text-muted-foreground mt-2 ml-7 italic">Hint: {q.hint}</p>
        )}
      </div>

      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 ml-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Answer</span>
              </div>
              <p className="text-sm text-emerald-900 dark:text-emerald-300 leading-relaxed">{q.answer}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setRevealed((v) => !v)}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-t",
          revealed
            ? "border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50",
        )}
      >
        {revealed ? (
          <><EyeOff className="h-3 w-3" />Hide answer</>
        ) : (
          <><Eye className="h-3 w-3" />Reveal answer</>
        )}
      </button>
    </div>
  );
}

function BlurtChallenge({ topic, method }: { topic: string; method: string }) {
  const [done, setDone] = useState(false);

  if (done) return null;

  const accentColor = method === "blurting" ? "orange" : "emerald";
  const borderClass = accentColor === "orange" ? "border-orange-500/30" : "border-emerald-500/30";
  const bgClass = accentColor === "orange" ? "bg-orange-500/5" : "bg-emerald-500/5";
  const textClass = accentColor === "orange" ? "text-orange-400" : "text-emerald-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-xl border px-5 py-4 mb-2", borderClass, bgClass)}
    >
      <div className="flex items-center gap-2 mb-3">
        <Brain className={cn("h-4 w-4", textClass)} />
        <span className={cn("text-xs font-semibold uppercase tracking-wider", textClass)}>
          Recall Challenge
        </span>
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed mb-4">
        Close this screen for 60 seconds. Write down everything you know about <strong>{topic}</strong>. Then come back and check.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDone(true)}
        className="text-xs"
      >
        <ChevronDown className="h-3.5 w-3.5" />
        Done — Show Content
      </Button>
    </motion.div>
  );
}

export function RetrievalReviewerView({
  reviewer,
  progression,
  learningMethod,
  studyMode,
  documentId,
  notes,
  onSectionComplete,
  onStartFlashcards,
}: {
  reviewer: RetrievalReviewer;
  progression?: DocumentProgression;
  learningMethod?: LearningMethod | null;
  studyMode?: StudyMode | null;
  documentId?: string;
  notes?: Map<number, { noteText: string; confusionLevel: number | null }>;
  onSectionComplete?: (index: number) => void;
  onStartFlashcards?: () => void;
}) {
  const total = reviewer.topics.length;
  const { completedCount, allComplete, currentIdx, completing, setCompleting, setLocalIdx } =
    useProgressionState(total, progression);

  const methodKey = (learningMethod ?? progression?.learningMethod ?? "active_recall") as string;
  const methodBadge = METHOD_BADGE[methodKey] ?? METHOD_BADGE.active_recall;
  const modeBadge = studyMode ? STUDY_MODE_BADGE[studyMode] : null;

  if (allComplete && !progression?.flashcardChallengeCompleted) {
    return (
      <ReviewerCompleteScreen
        topicTitles={reviewer.topics.map((t) => t.title)}
        onStartFlashcards={() => onStartFlashcards?.()}
      />
    );
  }

  if (allComplete && progression?.flashcardChallengeCompleted) {
    return <ReviewerAllDoneScreen />;
  }

  const topic = reviewer.topics[currentIdx];
  if (!topic) return null;

  async function handleMarkComplete() {
    if (completing) return;
    setCompleting(true);
    await onSectionComplete?.(currentIdx);
    if (currentIdx < total - 1) setLocalIdx(currentIdx + 1);
    setCompleting(false);
  }

  return (
    <div className="animate-fade-up flex gap-4 items-start">
      <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", methodBadge.cls)}>
          {methodBadge.label}
        </span>
        {modeBadge && (
          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", modeBadge.cls)}>
            {modeBadge.label}
          </span>
        )}
      </div>

      <SectionStepBar current={currentIdx} total={total} completedCount={completedCount} />

      <SectionSlide idx={currentIdx}>
        <div className="space-y-5">
          {/* Section header */}
          <div className="rounded-xl border-2 border-primary/25 bg-primary/5 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary flex-shrink-0">
                {currentIdx + 1}
              </div>
              <h3 className="font-semibold text-foreground text-lg leading-snug">{topic.title}</h3>
              <Badge variant="medium" className="ml-auto flex-shrink-0">Active</Badge>
            </div>
          </div>

          {/* Blurt / recall challenge — appears BEFORE content */}
          <BlurtChallenge topic={topic.title} method={methodKey} />

          {/* Retrieval questions with hidden answers */}
          {topic.questions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Retrieval Questions
                </span>
                <span className="text-xs text-muted-foreground ml-auto">Click to reveal answers</span>
              </div>
              <div className="space-y-3">
                {topic.questions.map((q, i) => (
                  <RetrievalQuestionCard key={i} q={q} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Key facts */}
          {topic.keyFacts.length > 0 && (
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckSquare className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Key Facts</span>
              </div>
              <ul className="space-y-2">
                {topic.keyFacts.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-400">
                      {i + 1}
                    </span>
                    <span className="text-foreground/85">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Common mistakes */}
          {topic.commonMistakes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                  Common Mistakes
                </span>
              </div>
              <div className="space-y-2">
                {topic.commonMistakes.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-orange-500/15 bg-orange-500/5 px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orange-400" />
                    <span className="text-foreground/80">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final challenge — shown on last section */}
          {currentIdx === total - 1 && reviewer.finalChallenge.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Final Challenge
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Cross-topic questions — these require synthesizing multiple sections.
              </p>
              <ul className="space-y-2">
                {reviewer.finalChallenge.map((q, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-foreground/85">{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <MarkCompleteButton
            isLast={currentIdx === total - 1}
            completing={completing}
            onClick={handleMarkComplete}
          />

          <CompletedSectionsList
            completedCount={completedCount}
            topics={reviewer.topics}
            currentIdx={currentIdx}
          />
        </div>
      </SectionSlide>
      </div>

      {documentId !== undefined && (
        <WorkspacePanel
          documentId={documentId}
          topicIndex={currentIdx}
          initialNote={notes?.get(currentIdx) ?? null}
          topic={{
            title: topic.title,
            coreIdea: topic.blurtPrompt,
            keyPoints: topic.keyFacts,
            mustMemorize: topic.questions.map((q) => q.q),
            boardTips: topic.commonMistakes,
          }}
          studyMode={studyMode ?? undefined}
        />
      )}
    </div>
  );
}

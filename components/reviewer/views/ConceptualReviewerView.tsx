"use client";

import { Lightbulb, ArrowRight, BookOpen, CheckSquare, HelpCircle, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConceptualReviewer, DocumentProgression, LearningMethod, StudyMode } from "@/lib/types";
import {
  SectionStepBar,
  SectionSlide,
  MarkCompleteButton,
  CompletedSectionsList,
  ReviewerCompleteScreen,
  ReviewerAllDoneScreen,
  useProgressionState,
} from "../shared";

const METHOD_BADGE: Record<string, { label: string; cls: string }> = {
  feynman:      { label: "Feynman Technique", cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  elaboration:  { label: "Elaboration",       cls: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  multisensory: { label: "Multisensory",      cls: "bg-lime-500/10 text-lime-400 border-lime-500/20" },
};

const STUDY_MODE_BADGE: Record<string, { label: string; cls: string }> = {
  cram:       { label: "Cram",       cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  conceptual: { label: "Conceptual", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  board_exam: { label: "Board Exam", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  mastery:    { label: "Mastery",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

export function ConceptualReviewerView({
  reviewer,
  progression,
  learningMethod,
  studyMode,
  onSectionComplete,
  onStartFlashcards,
}: {
  reviewer: ConceptualReviewer;
  progression?: DocumentProgression;
  learningMethod?: LearningMethod | null;
  studyMode?: StudyMode | null;
  onSectionComplete?: (index: number) => void;
  onStartFlashcards?: () => void;
}) {
  const total = reviewer.topics.length;
  const { completedCount, allComplete, currentIdx, completing, setCompleting, setLocalIdx } =
    useProgressionState(total, progression);

  const methodKey = learningMethod ?? progression?.learningMethod ?? "feynman";
  const methodBadge = METHOD_BADGE[methodKey] ?? METHOD_BADGE.feynman;
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
    <div className="animate-fade-up">
      {/* Badges */}
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
          <div className="rounded-xl border-2 border-primary/25 bg-primary/5 px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary flex-shrink-0">
                {currentIdx + 1}
              </div>
              <h3 className="font-semibold text-foreground text-lg leading-snug">{topic.title}</h3>
              <Badge variant="medium" className="ml-auto flex-shrink-0">Active</Badge>
            </div>
          </div>

          {/* Analogy card — the conceptual hook */}
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">Analogy</span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed italic">{topic.analogy}</p>
          </div>

          {/* Plain-language explanation */}
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">In Plain Terms</span>
            </div>
            <p className="text-sm text-foreground/85 leading-relaxed">{topic.simplifiedExplanation}</p>
          </div>

          {/* Mechanism chain */}
          {topic.mechanism.length > 0 && (
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {methodKey === "elaboration" ? "Mechanism" : "How It Works"}
                </span>
              </div>
              <div className="space-y-2">
                {topic.mechanism.map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-foreground/85">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key takeaways */}
          {topic.keyTakeaways.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <CheckSquare className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Key Takeaways</span>
              </div>
              <ul className="space-y-2">
                {topic.keyTakeaways.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                    <span className="text-foreground/85">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Self-check questions */}
          {topic.selfCheck.length > 0 && (
            <div className="rounded-lg border border-emerald-600/25 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2.5">
                <HelpCircle className="h-3.5 w-3.5 text-emerald-700" />
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Can You Explain This Back?
                </span>
              </div>
              <ul className="space-y-1.5">
                {topic.selfCheck.map((q, i) => (
                  <li key={i} className="text-sm text-emerald-900 dark:text-emerald-300 font-medium">{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Big picture — shown only on last section */}
          {currentIdx === total - 1 && reviewer.bigPicture && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">Big Picture</span>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">{reviewer.bigPicture}</p>
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
  );
}

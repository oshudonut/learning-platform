"use client";

import { Key, Link2, Star, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MemoryReviewer, MemoryAnchor, DocumentProgression, LearningMethod, StudyMode } from "@/lib/types";
import {
  SectionStepBar,
  SectionSlide,
  MarkCompleteButton,
  CompletedSectionsList,
  ReviewerCompleteScreen,
  ReviewerAllDoneScreen,
  useProgressionState,
} from "../shared";
import { ReviewerNotepad } from "@/components/reviewer/ReviewerNotepad";
import type { NoteCoachTopic } from "@/components/reviewer/NoteCoach";

const METHOD_BADGE: Record<string, { label: string; cls: string }> = {
  mnemonic:         { label: "Mnemonics",        cls: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  spaced_repetition:{ label: "Spaced Repetition", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  leitner:          { label: "Leitner System",    cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
};

const STUDY_MODE_BADGE: Record<string, { label: string; cls: string }> = {
  cram:       { label: "Cram",       cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  conceptual: { label: "Conceptual", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  board_exam: { label: "Board Exam", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  mastery:    { label: "Mastery",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

const PRIORITY_CONFIG = {
  HIGH:   { cls: "bg-red-500/15 text-red-400 border-red-500/20",       dot: "bg-red-400" },
  MEDIUM: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  LOW:    { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
};

function AnchorCard({ anchor }: { anchor: MemoryAnchor }) {
  const priorityCfg = PRIORITY_CONFIG[anchor.priority];
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-foreground leading-snug">{anchor.fact}</p>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ml-2", priorityCfg.cls)}>
            {anchor.priority}
          </span>
        </div>
        {anchor.reviewIn && (
          <div className="flex items-center gap-1 mb-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Review: {anchor.reviewIn}</span>
          </div>
        )}
      </div>
      <div className="border-t border-primary/15 bg-primary/5 px-4 py-2.5">
        <div className="flex items-start gap-2">
          <Key className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/85 leading-relaxed font-medium">{anchor.anchor}</p>
        </div>
      </div>
    </div>
  );
}

export function MemoryReviewerView({
  reviewer,
  progression,
  learningMethod,
  studyMode,
  documentId,
  notes,
  onSectionComplete,
  onStartFlashcards,
}: {
  reviewer: MemoryReviewer;
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

  const methodKey = (learningMethod ?? progression?.learningMethod ?? "mnemonic") as string;
  const methodBadge = METHOD_BADGE[methodKey] ?? METHOD_BADGE.mnemonic;
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

  const sortedAnchors = [...topic.anchors].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", methodBadge.cls)}>
          {methodBadge.label}
        </span>
        {modeBadge && (
          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", modeBadge.cls)}>
            {modeBadge.label}
          </span>
        )}
        {/* Priority legend */}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => (
            <span key={p} className="flex items-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_CONFIG[p].dot)} />
              {p}
            </span>
          ))}
        </div>
      </div>

      <SectionStepBar current={currentIdx} total={total} completedCount={completedCount} />

      <SectionSlide idx={currentIdx}>
        <div className="space-y-5">
          {/* Section header + core idea */}
          <div className="rounded-xl border-2 border-primary/25 bg-primary/5 px-6 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary flex-shrink-0">
                {currentIdx + 1}
              </div>
              <h3 className="font-semibold text-foreground text-lg leading-snug">{topic.title}</h3>
              <Badge variant="medium" className="ml-auto flex-shrink-0">Active</Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{topic.coreIdea}</p>
          </div>

          {/* Memory anchors */}
          {sortedAnchors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Key className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Memory Anchors
                </span>
              </div>
              <div className="space-y-3">
                {sortedAnchors.map((anchor, i) => (
                  <AnchorCard key={i} anchor={anchor} />
                ))}
              </div>
            </div>
          )}

          {/* Associations */}
          {topic.associations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Associations
                </span>
              </div>
              <div className="space-y-2">
                {topic.associations.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
                    <span className="font-semibold text-foreground flex-shrink-0">{a.concept}</span>
                    <span className="text-muted-foreground border-l border-border pl-3">{a.trick}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Master anchors — shown only on last section */}
          {currentIdx === total - 1 && reviewer.masterAnchors.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Star className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-foreground">Master Anchors</h3>
                <Badge variant="warning" className="ml-auto">High Yield</Badge>
              </div>
              <div className="space-y-3">
                {reviewer.masterAnchors.map((anchor, i) => (
                  <AnchorCard key={i} anchor={anchor} />
                ))}
              </div>
            </div>
          )}

          {documentId !== undefined && (
            <ReviewerNotepad
              documentId={documentId}
              topicIndex={currentIdx}
              initialNote={notes?.get(currentIdx) ?? null}
              topic={{
                title: topic.title,
                coreIdea: topic.coreIdea,
                keyPoints: topic.anchors.map((a) => a.fact),
                mustMemorize: topic.anchors.filter((a) => a.priority === "HIGH").map((a) => a.fact),
                boardTips: topic.associations.map((a) => `${a.concept}: ${a.trick}`),
              } satisfies NoteCoachTopic}
              studyMode={studyMode ?? undefined}
            />
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

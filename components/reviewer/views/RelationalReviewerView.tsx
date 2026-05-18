"use client";

import { Network, ArrowRight, GitMerge, AlertTriangle, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RelationalReviewer, DocumentProgression, LearningMethod, StudyMode } from "@/lib/types";
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
  mind_maps:    { label: "Mind Mapping",  cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  interleaving: { label: "Interleaving",  cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

const STUDY_MODE_BADGE: Record<string, { label: string; cls: string }> = {
  cram:       { label: "Cram",       cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  conceptual: { label: "Conceptual", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  board_exam: { label: "Board Exam", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  mastery:    { label: "Mastery",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

export function RelationalReviewerView({
  reviewer,
  progression,
  learningMethod,
  studyMode,
  documentId,
  notes,
  onSectionComplete,
  onStartFlashcards,
}: {
  reviewer: RelationalReviewer;
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

  const methodKey = (learningMethod ?? progression?.learningMethod ?? "mind_maps") as string;
  const methodBadge = METHOD_BADGE[methodKey] ?? METHOD_BADGE.mind_maps;
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
          {/* Section header + central concept */}
          <div className="rounded-xl border-2 border-primary/25 bg-primary/5 px-6 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary flex-shrink-0">
                {currentIdx + 1}
              </div>
              <h3 className="font-semibold text-foreground text-lg leading-snug">{topic.title}</h3>
              <Badge variant="medium" className="ml-auto flex-shrink-0">Active</Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{topic.centralConcept}</p>
          </div>

          {/* Concept web / nodes */}
          {topic.nodes.length > 0 && (
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-4">
                <Network className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Concept Web
                </span>
              </div>
              <div className="space-y-4">
                {topic.nodes.map((node, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      <span className="text-sm font-semibold text-foreground">{node.concept}</span>
                    </div>
                    {node.children.length > 0 && (
                      <div className="ml-4 pl-4 border-l border-primary/20 space-y-1.5">
                        {node.children.map((child, j) => (
                          <div key={j} className="flex items-start gap-2 text-sm">
                            <ArrowRight className="mt-0.5 h-3 w-3 text-primary/50 flex-shrink-0" />
                            <span className="text-foreground/75">{child}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {node.relatedTopics.length > 0 && (
                      <div className="ml-4 flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Connects to:</span>
                        {node.relatedTopics.map((rt, j) => (
                          <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {rt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-topic links */}
          {topic.crossLinks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <GitMerge className="h-3.5 w-3.5 text-cyan-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-500">
                  Cross-Topic Links
                </span>
              </div>
              <div className="space-y-2">
                {topic.crossLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 text-sm flex-wrap">
                    <span className="font-semibold text-foreground">{link.from}</span>
                    <span className="flex items-center gap-1 text-xs text-cyan-500 font-medium">
                      <ArrowRight className="h-3 w-3" />
                      {link.via}
                      <ArrowRight className="h-3 w-3" />
                    </span>
                    <span className="font-semibold text-foreground">{link.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contrasts */}
          {topic.contrastsWith.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                  Don&apos;t Confuse With
                </span>
              </div>
              <div className="space-y-2">
                {topic.contrastsWith.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-orange-500/15 bg-orange-500/5 px-3 py-2 text-sm">
                    <span className="font-semibold text-foreground flex-shrink-0">{c.topic}</span>
                    <span className="text-muted-foreground/80 border-l border-orange-500/20 pl-3">{c.keyDifference}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global concept map — shown only on last section */}
          {currentIdx === total - 1 && reviewer.conceptMap.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">Full Concept Map</h3>
              </div>
              <div className="space-y-2">
                {reviewer.conceptMap.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-medium text-foreground">{link.from}</span>
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <ArrowRight className="h-3 w-3" />
                      {link.relationship}
                      <ArrowRight className="h-3 w-3" />
                    </span>
                    <span className="font-medium text-foreground">{link.to}</span>
                  </div>
                ))}
              </div>
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
            coreIdea: topic.centralConcept,
            keyPoints: topic.nodes.map((n) => n.concept),
            mustMemorize: topic.crossLinks.map((l) => `${l.from} → ${l.via} → ${l.to}`),
            boardTips: topic.contrastsWith.map((c) => `vs ${c.topic}: ${c.keyDifference}`),
          }}
          studyMode={studyMode ?? undefined}
        />
      )}
    </div>
  );
}

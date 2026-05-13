"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Lightbulb,
  Star,
  Brain,
  Target,
  Sparkles,
  CheckSquare,
  AlertTriangle,
  HelpCircle,
  Zap,
  Lock,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Reviewer, ReviewerTopic, DocumentProgression } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckpointChallenge } from "./CheckpointChallenge";
import { getPendingCheckpoint } from "@/lib/progression";

type SectionState = "locked" | "active" | "completed";

function TopicCard({
  topic,
  index,
  sectionState,
  onComplete,
}: {
  topic: ReviewerTopic;
  index: number;
  sectionState: SectionState;
  onComplete?: () => void;
}) {
  const [expanded, setExpanded] = useState(sectionState === "active");

  if (sectionState === "locked") {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden opacity-50">
        <div className="px-5 py-4 flex items-center gap-3">
          <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-semibold text-muted-foreground">{topic.title}</span>
          <span className="text-xs text-muted-foreground ml-auto">Complete previous section to unlock</span>
        </div>
      </div>
    );
  }

  if (sectionState === "completed") {
    return (
      <div className="rounded-xl border border-success/20 bg-success/5 overflow-hidden">
        <button
          className="w-full px-5 py-4 flex items-center gap-3 text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
          <span className="font-semibold text-foreground flex-1">{topic.title}</span>
          <Badge variant="easy" className="text-xs">Completed</Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>
        {expanded && (
          <div className="px-5 pb-4 border-t border-success/10">
            <TopicContent topic={topic} />
          </div>
        )}
      </div>
    );
  }

  // Active state
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl border-2 border-primary/30 bg-[#D8ECF4] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-sky-200/60 bg-primary/5">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-foreground flex-1">{topic.title}</h4>
          <Badge variant="medium">Active</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-snug">{topic.coreIdea}</p>
      </div>

      <div className="px-5 py-4 space-y-4">
        <TopicContent topic={topic} />

        {/* Complete button */}
        <div className="pt-2 border-t border-sky-200/60">
          <Button variant="accent" className="w-full" onClick={onComplete}>
            <CheckCircle2 className="h-4 w-4" />
            Mark Section Complete & Continue
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function TopicContent({ topic }: { topic: ReviewerTopic }) {
  return (
    <div className="space-y-4">
      {/* Key Points */}
      {topic.keyPoints.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Key Points</span>
          </div>
          <ul className="space-y-1.5">
            {topic.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-foreground/85">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick Breakdown */}
      {topic.quickBreakdown.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Breakdown</span>
          </div>
          <ul className="space-y-1.5">
            {topic.quickBreakdown.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Must Memorize */}
      {topic.mustMemorize.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Must Memorize</span>
          </div>
          <ul className="space-y-1.5">
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

      {/* Confused With */}
      {topic.confusedWith && topic.confusedWith.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
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

      {/* Board Tips */}
      {topic.boardTips.length > 0 && (
        <div className="border-l-2 border-sky-600/50 pl-3">
          <div className="flex items-center gap-1.5 mb-2">
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

      {/* Quick Recall */}
      {topic.quickRecall.length > 0 && (
        <div className="rounded-lg border border-emerald-600/25 bg-emerald-50 px-3 py-3">
          <div className="flex items-center gap-1.5 mb-2">
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

export function ReviewerView({
  reviewer,
  progression,
  documentId,
  onSectionComplete,
  onCheckpointComplete,
}: {
  reviewer: Reviewer;
  progression?: DocumentProgression;
  documentId?: string;
  onSectionComplete?: (index: number) => void;
  onCheckpointComplete?: (index: number) => void;
}) {
  const pendingCheckpoint = progression ? getPendingCheckpoint(progression) : null;

  function getSectionState(index: number): SectionState {
    if (!progression) return "active";
    const status = progression.sectionStatuses[index];
    if (!status) return "active";
    if (status.completed) return "completed";
    // Check if previous section is complete or it's the first section
    if (index === 0) return "active";
    const prev = progression.sectionStatuses[index - 1];
    if (!prev?.completed) return "locked";
    // Check if there's a pending checkpoint blocking this section
    if (pendingCheckpoint !== null) return "locked";
    return "active";
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Summary */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 px-6 py-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Overview</span>
        </div>
        <p className="text-foreground/90 leading-relaxed">{reviewer.summary}</p>
      </div>

      {/* Progress bar */}
      {progression && (
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Section Progress</span>
            <span className="text-sm text-muted-foreground">
              {progression.sectionStatuses.filter(s => s.completed).length} / {progression.sectionStatuses.length} sections
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${progression.sectionStatuses.length > 0
                  ? (progression.sectionStatuses.filter(s => s.completed).length / progression.sectionStatuses.length) * 100
                  : 0}%`
              }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2">
            {progression.checkpointStatuses.map((cp) => (
              <div key={cp.checkpointIndex} className="flex items-center gap-1">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  cp.completed ? "bg-success" : "bg-muted-foreground/30"
                )} />
                <span className="text-xs text-muted-foreground">{(cp.checkpointIndex + 1) * 20}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topics with progression */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Topics</h3>
          <span className="text-xs text-muted-foreground">({reviewer.topics.length})</span>
        </div>
        <div className="space-y-3">
          {reviewer.topics.map((topic, i) => {
            const state = getSectionState(i);
            // Check if this is where a checkpoint should be inserted AFTER completing this section
            const isBeforeCheckpoint = progression && pendingCheckpoint !== null &&
              progression.sectionStatuses[i]?.completed && pendingCheckpoint !== null;

            return (
              <div key={i}>
                <TopicCard
                  topic={topic}
                  index={i}
                  sectionState={state}
                  onComplete={state === "active" ? () => onSectionComplete?.(i) : undefined}
                />
                {/* Checkpoint challenge — appears after completing a section when checkpoint is pending */}
                {isBeforeCheckpoint && pendingCheckpoint !== null &&
                  progression?.checkpointStatuses[pendingCheckpoint]?.sectionsCovered.includes(i) &&
                  documentId && (
                    <div className="mt-3">
                      <CheckpointChallenge
                        documentId={documentId}
                        checkpointIndex={pendingCheckpoint}
                        onComplete={() => onCheckpointComplete?.(pendingCheckpoint)}
                      />
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active checkpoint challenge — shown when triggered */}
      {progression && pendingCheckpoint !== null && documentId &&
        !progression.sectionStatuses[progression.sectionStatuses.findIndex(s => !s.completed) - 1]?.completed && (
          <CheckpointChallenge
            documentId={documentId}
            checkpointIndex={pendingCheckpoint}
            onComplete={() => onCheckpointComplete?.(pendingCheckpoint)}
          />
        )}

      {/* Global Must Memorize */}
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

      {/* Mnemonics */}
      {reviewer.mnemonics.length > 0 && (
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
    </div>
  );
}

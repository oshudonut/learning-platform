"use client";

import { Brain, ChevronRight, HelpCircle, Lightbulb, Target, Zap } from "lucide-react";
import { BoardExamCallout } from "@/components/reviewer/primitives/BoardExamCallout";
import { BoardTipStrip } from "@/components/reviewer/primitives/BoardTipStrip";
import { DiffTable } from "@/components/reviewer/primitives/DiffTable";
import { MnemonicCard } from "@/components/reviewer/primitives/MnemonicCard";
import { SemanticLabel } from "@/components/reviewer/primitives/SemanticLabel";
import { formatBoardText } from "@/components/reviewer/primitives/formatBoardText";
import type { ReviewerTopic } from "@/lib/types";

interface BoardExamTopicRendererProps {
  topic: ReviewerTopic;
  isLastSection: boolean;
  globalMustMemorize: string[];
  mnemonics: { concept: string; aid: string }[];
}

// Find mnemonics relevant to the current topic by matching significant words
// from the topic title against the mnemonic concept field.
function matchMnemonics(
  mnemonics: { concept: string; aid: string }[],
  topic: ReviewerTopic,
): { concept: string; aid: string }[] {
  const STOP_WORDS = new Set([
    "with", "from", "that", "this", "than", "have", "when", "also",
    "most", "more", "less", "into", "over", "under", "their", "about",
  ]);
  const titleWords = topic.title
    .toLowerCase()
    .split(/[\s\-\/,()]+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  if (titleWords.length === 0) return [];

  return mnemonics.filter(m => {
    const concept = m.concept.toLowerCase();
    return titleWords.some(w => concept.includes(w));
  });
}

export function BoardExamTopicRenderer({
  topic,
  isLastSection,
  globalMustMemorize,
  mnemonics,
}: BoardExamTopicRendererProps) {
  // Mnemonics matched to this specific topic (shown inline on non-last sections).
  // Last section shows the full global summary instead to avoid duplication.
  const topicMnemonics = isLastSection ? [] : matchMnemonics(mnemonics, topic);

  return (
    <div className="space-y-2.5">

      {/* Core Idea — amber left-border banner, always first */}
      <div className="flex items-start gap-2.5 rounded-lg border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
        <ChevronRight className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium italic text-amber-900 dark:text-amber-200 leading-snug">
          {topic.coreIdea}
        </p>
      </div>

      {/* Two-column body: left = explanatory, right = high-yield */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">

        {/* Left column — Key Points + Quick Breakdown */}
        <div className="space-y-2.5">
          {topic.keyPoints.length > 0 && (
            <BoardExamCallout variant="muted" label="Key Points" icon={Brain}>
              <ul className="space-y-1">
                {topic.keyPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                    <span className="leading-snug flex-1 min-w-0 text-foreground/85">
                      <SemanticLabel text={pt} />
                    </span>
                  </li>
                ))}
              </ul>
            </BoardExamCallout>
          )}

          {topic.quickBreakdown.length > 0 && (
            <BoardExamCallout variant="muted" label="Quick Breakdown" icon={Zap}>
              <ul className="space-y-1">
                {topic.quickBreakdown.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/30" />
                    <span className="text-muted-foreground leading-snug">
                      {formatBoardText(b)}
                    </span>
                  </li>
                ))}
              </ul>
            </BoardExamCallout>
          )}
        </div>

        {/* Right column — Must Memorize + Board Tips */}
        <div className="space-y-2.5">
          {topic.mustMemorize.length > 0 && (
            <BoardExamCallout variant="amber" label="Must Memorize" icon={Target}>
              <ol className="space-y-1.5">
                {topic.mustMemorize.map((fact, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-amber-500/20 text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-medium text-amber-900 dark:text-amber-100 leading-snug flex-1 min-w-0">
                      <SemanticLabel text={fact} />
                    </span>
                  </li>
                ))}
              </ol>
            </BoardExamCallout>
          )}

          {topic.boardTips.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <BoardTipStrip tips={topic.boardTips} />
            </div>
          )}
        </div>
      </div>

      {/* Don't Confuse — full width, red/green comparison grid */}
      {(topic.confusedWith?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
            Don&apos;t Confuse
          </p>
          <DiffTable rows={topic.confusedWith!} />
        </div>
      )}

      {/* Quick Recall — full width, board-style questions */}
      {topic.quickRecall.length > 0 && (
        <BoardExamCallout variant="emerald" label="Quick Recall" icon={HelpCircle}>
          <ul className="space-y-1">
            {topic.quickRecall.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">?</span>
                <span className="italic text-emerald-800 dark:text-emerald-200 leading-snug">{q}</span>
              </li>
            ))}
          </ul>
        </BoardExamCallout>
      )}

      {/* Topic-matched mnemonics — inline per section (skipped on last section
          since the global summary below already covers everything) */}
      {topicMnemonics.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3" />
            Memory Aid{topicMnemonics.length > 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topicMnemonics.map((m, i) => (
              <MnemonicCard key={i} concept={m.concept} aid={m.aid} />
            ))}
          </div>
        </div>
      )}

      {/* Last section only: Global Must Memorize + full Mnemonic summary */}
      {isLastSection && (
        <>
          {globalMustMemorize.length > 0 && (
            <BoardExamCallout variant="amber" label="Global Must Memorize" icon={Target} badge="High Yield">
              <ol className="space-y-2">
                {globalMustMemorize.map((fact, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-amber-500/20 text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-amber-900 dark:text-amber-100 leading-snug flex-1 min-w-0">
                      <SemanticLabel text={fact} />
                    </span>
                  </li>
                ))}
              </ol>
            </BoardExamCallout>
          )}

          {mnemonics.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" />
                Memory Aids
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mnemonics.map((m, i) => (
                  <MnemonicCard key={i} concept={m.concept} aid={m.aid} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}

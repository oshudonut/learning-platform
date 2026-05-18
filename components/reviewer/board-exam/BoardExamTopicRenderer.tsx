"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { AcademicBulletList } from "@/components/reviewer/primitives/AcademicBulletList";
import { BoardTipStrip } from "@/components/reviewer/primitives/BoardTipStrip";
import { DiffTable } from "@/components/reviewer/primitives/DiffTable";
import { MnemonicCard } from "@/components/reviewer/primitives/MnemonicCard";
import { SectionLabel } from "@/components/reviewer/primitives/SectionLabel";
import { formatBoardText } from "@/components/reviewer/primitives/formatBoardText";
import { HighlightableText } from "@/components/reviewer/primitives/HighlightableText";
import { CompanionPanel, CompanionTriggerButton } from "@/components/reviewer/CompanionPanel";
import type { CompanionTrigger } from "@/components/reviewer/CompanionPanel";
import type { ReviewerTopic } from "@/lib/types";
import type { ReviewerHighlight } from "@/lib/store";

interface BoardExamTopicRendererProps {
  topic: ReviewerTopic;
  isLastSection: boolean;
  globalMustMemorize: string[];
  mnemonics: { concept: string; aid: string }[];
  documentId?: string;
  topicIndex?: number;
  highlights?: ReviewerHighlight[];
  onHighlightCreated?: (h: ReviewerHighlight) => void;
  onHighlightDeleted?: (id: string) => void;
}

const STOP_WORDS = new Set([
  "with", "from", "that", "this", "than", "have", "when", "also",
  "most", "more", "less", "into", "over", "under", "their", "about",
]);

function matchMnemonics(
  mnemonics: { concept: string; aid: string }[],
  topic: ReviewerTopic,
): { concept: string; aid: string }[] {
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

type CompanionOpen = { trigger: CompanionTrigger; noteText?: string; confusionLevel?: number } | null;

export function BoardExamTopicRenderer({
  topic,
  isLastSection,
  globalMustMemorize,
  mnemonics,
  documentId,
  topicIndex,
  highlights = [],
  onHighlightCreated,
  onHighlightDeleted,
}: BoardExamTopicRendererProps) {
  const topicMnemonics = isLastSection ? [] : matchMnemonics(mnemonics, topic);
  const [companionOpen, setCompanionOpen] = useState<CompanionOpen>(null);

  const companionTopic = {
    title: topic.title,
    coreIdea: topic.coreIdea,
    keyPoints: topic.keyPoints,
    mustMemorize: topic.mustMemorize,
    boardTips: topic.boardTips,
  };

  function handleOpenCompanion(trigger: CompanionTrigger, noteText?: string, confusionLevel?: number) {
    // If confusion trigger arrives but companion is already open for explicit help, don't override
    if (companionOpen?.trigger === "explicit_help" && trigger === "confusion") return;
    setCompanionOpen({ trigger, noteText, confusionLevel });
  }

  // Whether highlighting is active for this renderer
  const canHighlight = documentId !== undefined && topicIndex !== undefined
    && onHighlightCreated !== undefined && onHighlightDeleted !== undefined;

  function fieldHighlights(fieldName: string, itemIndex: number) {
    return highlights.filter(h => h.fieldName === fieldName && h.itemIndex === itemIndex);
  }

  function renderText(text: string, fieldName: string, itemIndex: number) {
    if (canHighlight) {
      return (
        <HighlightableText
          text={text}
          highlights={fieldHighlights(fieldName, itemIndex)}
          documentId={documentId!}
          topicIndex={topicIndex!}
          fieldName={fieldName}
          itemIndex={itemIndex}
          onHighlightCreated={onHighlightCreated!}
          onHighlightDeleted={onHighlightDeleted!}
        />
      );
    }
    // Fallback: formatBoardText without highlighting
    return <>{formatBoardText(text)}</>;
  }

  return (
    <div className="space-y-4">

      {/* Core Idea — plain italic, left-rule accent, no card */}
      <p className="text-sm italic text-foreground/75 leading-relaxed border-l-2 border-muted-foreground/25 pl-3">
        {renderText(topic.coreIdea, "coreIdea", 0)}
      </p>

      {/* Two-column body: left = explanatory, right = high-yield */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">

        {/* Left column — Key Points + Quick Breakdown */}
        <div className="space-y-4">
          {topic.keyPoints.length > 0 && (
            <div>
              <SectionLabel>Key Points</SectionLabel>
              <AcademicBulletList
                items={topic.keyPoints}
                renderItem={(pt, idx) => (
                  <span className="text-foreground/85">
                    {renderText(pt, "keyPoints", idx)}
                  </span>
                )}
              />
            </div>
          )}

          {topic.quickBreakdown.length > 0 && (
            <div>
              <SectionLabel>Quick Breakdown</SectionLabel>
              <AcademicBulletList
                items={topic.quickBreakdown}
                renderItem={(b, idx) => (
                  <span className="text-foreground/65">
                    {renderText(b, "quickBreakdown", idx)}
                  </span>
                )}
              />
            </div>
          )}
        </div>

        {/* Right column — Must Memorize + Board Tips */}
        <div className="space-y-4">
          {topic.mustMemorize.length > 0 && (
            <div>
              <SectionLabel variant="cyan">Must Memorize</SectionLabel>
              <AcademicBulletList
                items={topic.mustMemorize}
                ordered
                renderItem={(fact, idx) => (
                  <span className="font-medium text-foreground/90">
                    {renderText(fact, "mustMemorize", idx)}
                  </span>
                )}
              />
            </div>
          )}

          {topic.boardTips.length > 0 && (
            <BoardTipStrip tips={topic.boardTips} />
          )}
        </div>
      </div>

      {/* Don't Confuse — full width */}
      {(topic.confusedWith?.length ?? 0) > 0 && (
        <div>
          <SectionLabel variant="cyan">Don&apos;t Confuse</SectionLabel>
          <DiffTable rows={topic.confusedWith!} />
        </div>
      )}

      {/* Quick Recall — full width */}
      {topic.quickRecall.length > 0 && (
        <div>
          <SectionLabel variant="cyan">Quick Recall</SectionLabel>
          <ul className="space-y-1">
            {topic.quickRecall.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="font-bold text-cyan-600 dark:text-cyan-400 flex-shrink-0">?</span>
                <span className="italic text-foreground/70 leading-snug">
                  {renderText(q, "quickRecall", i)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Inline topic-matched mnemonics (skipped on last section — global summary below covers all) */}
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
            <div>
              <SectionLabel variant="blue">
                Global Must Memorize{" "}
                <span className="ml-1 text-[9px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-wide normal-case">
                  High Yield
                </span>
              </SectionLabel>
              <AcademicBulletList
                items={globalMustMemorize}
                ordered
                renderItem={(fact) => (
                  <span className="font-semibold text-foreground/90">
                    {formatBoardText(fact)}
                  </span>
                )}
              />
            </div>
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

      {/* AI Companion — trigger button + inline panel */}
      {documentId !== undefined && topicIndex !== undefined && (
        <div>
          {!companionOpen && (
            <div className="flex justify-end">
              <CompanionTriggerButton onClick={() => handleOpenCompanion("explicit_help")} />
            </div>
          )}
          {companionOpen && (
            <CompanionPanel
              key={`${topicIndex}-${companionOpen.trigger}-${companionOpen.noteText?.slice(0, 20) ?? ""}`}
              documentId={documentId}
              topicIndex={topicIndex}
              topic={companionTopic}
              trigger={companionOpen.trigger}
              noteText={companionOpen.noteText}
              confusionLevel={companionOpen.confusionLevel}
              onClose={() => setCompanionOpen(null)}
            />
          )}
        </div>
      )}

    </div>
  );
}

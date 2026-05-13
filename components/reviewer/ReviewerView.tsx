"use client";

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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Reviewer, ReviewerTopic } from "@/lib/types";
import { cn } from "@/lib/utils";

function TopicCard({ topic, index }: { topic: ReviewerTopic; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl border border-sky-200/60 bg-[#D8ECF4] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-sky-200/60">
        <h4 className="font-semibold text-foreground">{topic.title}</h4>
        <p className="text-sm text-muted-foreground mt-1 leading-snug">
          {topic.coreIdea}
        </p>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Key Points */}
        {topic.keyPoints.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Key Points
              </span>
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
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Breakdown
              </span>
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
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Must Memorize
              </span>
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
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Confused With
              </span>
            </div>
            <div className="space-y-2">
              {topic.confusedWith.map((row, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-orange-500/15 bg-orange-500/5 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-foreground flex-shrink-0">
                    {row.item}
                  </span>
                  <span className="text-muted-foreground/80 border-l border-orange-500/20 pl-3">
                    {row.distinction}
                  </span>
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
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                Board Tips
              </span>
            </div>
            <ul className="space-y-1.5">
              {topic.boardTips.map((tip, i) => (
                <li key={i} className="text-sm text-foreground/80">
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick Recall */}
        {topic.quickRecall.length > 0 && (
          <div className="rounded-lg border border-emerald-600/25 bg-emerald-50 px-3 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <HelpCircle className="h-3.5 w-3.5 text-emerald-700" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Quick Recall
              </span>
            </div>
            <ul className="space-y-1.5">
              {topic.quickRecall.map((q, i) => (
                <li key={i} className="text-sm text-emerald-900 font-medium">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ReviewerView({ reviewer }: { reviewer: Reviewer }) {
  return (
    <div className="space-y-8 animate-fade-up">
      {/* Summary */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 px-6 py-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Overview
          </span>
        </div>
        <p className="text-foreground/90 leading-relaxed">{reviewer.summary}</p>
      </div>

      {/* Topics */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Topics</h3>
          <span className="text-xs text-muted-foreground">
            ({reviewer.topics.length})
          </span>
        </div>
        <div className="space-y-3">
          {reviewer.topics.map((topic, i) => (
            <TopicCard key={i} topic={topic} index={i} />
          ))}
        </div>
      </div>

      {/* Global Must Memorize */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-foreground">Global Must Memorize</h3>
          <Badge variant="warning" className="ml-auto">
            High Yield
          </Badge>
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
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-xs font-semibold text-foreground">
                    {m.concept}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed pl-5">
                  {m.aid}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

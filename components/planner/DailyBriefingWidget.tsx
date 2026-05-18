"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CalendarDays, TrendingDown, TrendingUp, Minus,
  AlertTriangle, ArrowRight, Flame, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlannerAI } from "@/hooks/usePlannerAI";
import type { PlannerAnalysis } from "@/hooks/usePlannerAI";

// ─── Badge config ─────────────────────────────────────────────────────────────

const READINESS_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  "Critical":   { text: "text-red-600",     bg: "bg-red-500/10",    border: "border-red-500/20" },
  "Weak":       { text: "text-orange-600",   bg: "bg-orange-500/10", border: "border-orange-500/20" },
  "Developing": { text: "text-amber-600",    bg: "bg-amber-500/10",  border: "border-amber-500/20" },
  "Strong":     { text: "text-emerald-600",  bg: "bg-emerald-500/10",border: "border-emerald-500/20" },
  "Exam Ready": { text: "text-primary",      bg: "bg-primary/10",    border: "border-primary/20" },
};

const PACE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  behind:   { icon: TrendingDown, label: "Behind",   color: "text-red-500" },
  on_track: { icon: Minus,        label: "On Track", color: "text-primary" },
  ahead:    { icon: TrendingUp,   label: "Ahead",    color: "text-emerald-500" },
};

const BURNOUT_COLOR: Record<string, string> = {
  low:      "text-emerald-600",
  moderate: "text-amber-600",
  high:     "text-red-600",
};

const REC_TYPE_ICON: Record<string, React.ElementType> = {
  reschedule: CalendarDays,
  focus:      Target,
  review:     Minus,
  rest:       Flame,
  alert:      AlertTriangle,
};

const REC_PRIORITY_STYLE: Record<string, string> = {
  high:   "text-red-500 bg-red-500/8",
  medium: "text-amber-500 bg-amber-500/8",
  low:    "text-muted-foreground bg-muted/50",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-36 rounded-full bg-muted" />
        <div className="h-6 w-20 rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded-full bg-muted" />
        <div className="h-3 w-4/5 rounded-full bg-muted" />
        <div className="h-3 w-3/5 rounded-full bg-muted" />
      </div>
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full bg-muted" />
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
    </div>
  );
}

// ─── Widget content ───────────────────────────────────────────────────────────

function BriefingContent({
  analysis,
  planId,
  planTitle,
}: {
  analysis: PlannerAnalysis;
  planId: string;
  planTitle?: string;
}) {
  const readinessStyle = READINESS_STYLE[analysis.readinessLabel] ?? READINESS_STYLE["Developing"];
  const PaceIcon = PACE_META[analysis.paceStatus]?.icon ?? Minus;
  const paceColor = PACE_META[analysis.paceStatus]?.color ?? "text-primary";
  const paceLabel = PACE_META[analysis.paceStatus]?.label ?? "On Track";
  const burnoutColor = BURNOUT_COLOR[analysis.burnoutRisk] ?? "text-muted-foreground";

  // Top 2 high-priority recommendations
  const topRecs = analysis.recommendations
    .filter((r) => r.priority === "high")
    .slice(0, 2);

  const daysLeft = analysis.daysUntilExam;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">
            {planTitle ? `${planTitle}` : "Daily Study Brief"}
          </span>
          {daysLeft > 0 && (
            <span className={cn("text-[10px] font-semibold ml-1", daysLeft <= 7 ? "text-red-500" : "text-muted-foreground")}>
              · {daysLeft}d to exam
            </span>
          )}
        </div>
        {/* Readiness score pill */}
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold",
          readinessStyle.text, readinessStyle.bg, readinessStyle.border,
        )}>
          {analysis.readinessScore} · {analysis.readinessLabel}
        </span>
      </div>

      {/* Briefing text */}
      <div className="px-5 py-3">
        <p className="text-sm text-foreground leading-relaxed">{analysis.briefing}</p>
      </div>

      {/* Top recommendations */}
      {topRecs.length > 0 && (
        <div className="px-5 pb-3 space-y-2">
          {topRecs.map((rec, i) => {
            const Icon = REC_TYPE_ICON[rec.type] ?? Target;
            return (
              <div key={i} className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
                <span className={cn("flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md mt-0.5", REC_PRIORITY_STYLE[rec.priority])}>
                  <Icon className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground leading-snug">{rec.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{rec.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer badges + link */}
      <div className="flex items-center justify-between px-5 pb-4 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("flex items-center gap-1 text-[10px] font-medium", paceColor)}>
            <PaceIcon className="h-3 w-3" />
            {paceLabel}
          </span>
          <span className="text-muted-foreground/40 text-[10px]">·</span>
          <span className={cn("text-[10px] font-medium", burnoutColor)}>
            Burnout: {analysis.burnoutRisk}
          </span>
        </div>
        <Link
          href={`/planner/${planId}`}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity"
        >
          View Plan <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type Props = {
  planId: string;
  planTitle?: string;
};

export function DailyBriefingWidget({ planId, planTitle }: Props) {
  const { analysis, analyzeLoading, analyze } = usePlannerAI(planId);

  useEffect(() => {
    void analyze();
  }, [analyze]);

  if (analyzeLoading && !analysis) return <Skeleton />;
  if (!analysis) return null;

  return <BriefingContent analysis={analysis} planId={planId} planTitle={planTitle} />;
}

"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Target,
  Brain,
  Calendar,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadiness } from "@/hooks/useReadiness";
import type { TopicReadiness, ReadinessLabel } from "@/hooks/useReadiness";

const LABEL_META: Record<ReadinessLabel, { color: string; bg: string; ring: string }> = {
  "Critical":   { color: "text-red-600",    bg: "bg-red-500/10",    ring: "ring-red-500/30" },
  "Weak":       { color: "text-orange-500", bg: "bg-orange-500/10", ring: "ring-orange-500/30" },
  "Developing": { color: "text-amber-500",  bg: "bg-amber-500/10",  ring: "ring-amber-500/30" },
  "Strong":     { color: "text-emerald-600",bg: "bg-emerald-500/10",ring: "ring-emerald-500/30" },
  "Exam Ready": { color: "text-primary",    bg: "bg-primary/10",    ring: "ring-primary/30" },
};

const LABEL_ORDER: ReadinessLabel[] = ["Critical", "Weak", "Developing", "Strong", "Exam Ready"];

const FACTOR_META: { key: keyof TopicReadiness["factors"]; label: string; icon: React.ElementType }[] = [
  { key: "completion", label: "Sections",  icon: BookOpen },
  { key: "quiz",       label: "Quiz",      icon: Target },
  { key: "focus",      label: "Focus",     icon: Brain },
  { key: "reviews",    label: "Reviews",   icon: Calendar },
  { key: "momentum",   label: "Momentum",  icon: Zap },
];

function ScoreGauge({ score, label }: { score: number; label: ReadinessLabel }) {
  const meta = LABEL_META[label];
  const circumference = 2 * Math.PI * 38;
  const strokeDash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-28 w-28">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="8"
            className="text-muted/30" />
          <motion.circle
            cx="50" cy="50" r="38" fill="none"
            strokeWidth="8" strokeLinecap="round"
            stroke="currentColor"
            className={cn(meta.color)}
            strokeDasharray={`${circumference}`}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - strokeDash }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">{score}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className={cn("text-sm font-semibold px-3 py-1 rounded-full ring-1", meta.color, meta.bg, meta.ring)}>
        {label}
      </span>
    </div>
  );
}

function FactorBar({ value, label, icon: Icon }: { value: number; label: string; icon: React.ElementType }) {
  const color = value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-[10px] text-muted-foreground w-14 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground w-7 text-right flex-shrink-0">{value}</span>
    </div>
  );
}

function TopicCard({ topic }: { topic: TopicReadiness }) {
  const meta = LABEL_META[topic.readinessLabel];
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground leading-snug flex-1">{topic.documentTitle}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg font-bold text-foreground">{topic.readinessScore}</span>
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1", meta.color, meta.bg, meta.ring)}>
            {topic.readinessLabel}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        {FACTOR_META.map(({ key, label, icon }) => (
          <FactorBar key={key} value={topic.factors[key]} label={label} icon={icon} />
        ))}
      </div>

      {topic.weakTopics.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Weak areas</p>
          <div className="flex flex-wrap gap-1">
            {topic.weakTopics.map((t) => (
              <span key={t} className="text-[10px] bg-red-500/8 text-red-600 px-2 py-0.5 rounded-full ring-1 ring-red-500/20">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-0.5">
        {topic.quizScore !== null && (
          <span>Quiz: <span className="font-semibold text-foreground">{topic.quizScore}%</span></span>
        )}
        {topic.overdueCount > 0 && (
          <span className="text-red-500 font-semibold">{topic.overdueCount} overdue</span>
        )}
        {topic.lastActivityDays !== null && (
          <span>
            Last active: <span className="font-semibold text-foreground">
              {topic.lastActivityDays === 0 ? "today" : `${topic.lastActivityDays}d ago`}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export function ReadinessReport({ planId }: { planId: string }) {
  const { readiness, loading, error, fetch: fetchReadiness, invalidate } = useReadiness(planId);

  useEffect(() => {
    void fetchReadiness();
  }, [fetchReadiness]);

  if (loading && !readiness) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-600">
        <p className="font-semibold mb-1">Could not load readiness</p>
        <p className="text-xs">{error}</p>
        <button
          onClick={() => void fetchReadiness(true)}
          className="mt-3 text-xs underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!readiness) return null;

  const { overall, label, daysUntilExam, topicReadiness, labelCounts, strongestDoc, weakestDoc } = readiness;

  const hasAnyLabels = LABEL_ORDER.some((l) => labelCounts[l] > 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Exam Readiness</h2>
          {daysUntilExam > 0 ? (
            <p className="text-xs text-muted-foreground mt-0.5">{daysUntilExam} days until exam</p>
          ) : (
            <p className="text-xs text-red-500 font-semibold mt-0.5">Exam date has passed</p>
          )}
        </div>
        <button
          onClick={() => { invalidate(); void fetchReadiness(true); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {/* Overall gauge + label distribution */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ScoreGauge score={overall} label={label} />

          <div className="flex-1 w-full">
            {/* Label distribution bar */}
            {hasAnyLabels && (
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Topic distribution
                </p>
                <div className="flex h-3 rounded-full overflow-hidden gap-px">
                  {LABEL_ORDER.map((l) => {
                    const count = labelCounts[l];
                    if (!count) return null;
                    const pct = (count / topicReadiness.length) * 100;
                    return (
                      <div
                        key={l}
                        className={cn("h-full", LABEL_META[l].bg.replace("/10", "/60"))}
                        style={{ width: `${pct}%` }}
                        title={`${l}: ${count}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {LABEL_ORDER.map((l) => {
                    const count = labelCounts[l];
                    if (!count) return null;
                    return (
                      <span key={l} className={cn("text-[10px] font-semibold", LABEL_META[l].color)}>
                        {count} {l}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strongest / weakest callouts */}
            <div className="grid grid-cols-2 gap-2">
              {strongestDoc && (
                <div className="rounded-lg bg-emerald-500/8 ring-1 ring-emerald-500/20 p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                    <span className="text-[10px] font-semibold text-emerald-600">Strongest</span>
                  </div>
                  <p className="text-[11px] text-foreground leading-snug line-clamp-2">{strongestDoc}</p>
                </div>
              )}
              {weakestDoc && (
                <div className="rounded-lg bg-red-500/8 ring-1 ring-red-500/20 p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown className="h-3 w-3 text-red-600" />
                    <span className="text-[10px] font-semibold text-red-600">Needs Work</span>
                  </div>
                  <p className="text-[11px] text-foreground leading-snug line-clamp-2">{weakestDoc}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Urgent topics */}
      {topicReadiness.some((t) => t.readinessLabel === "Critical") && (
        <div className="rounded-xl border border-red-200 bg-red-500/5 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-600">Critical topics require immediate attention</p>
            <p className="text-[11px] text-red-500 mt-0.5">
              {topicReadiness.filter((t) => t.readinessLabel === "Critical").map((t) => t.documentTitle).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Exam ready banner */}
      {topicReadiness.every((t) => t.readinessLabel === "Exam Ready") && topicReadiness.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-500/5 p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-emerald-700">All topics at exam-ready level. You&apos;re prepared!</p>
        </div>
      )}

      {/* Per-topic cards */}
      {topicReadiness.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            By Topic
          </p>
          {topicReadiness.map((topic) => (
            <TopicCard key={topic.documentId} topic={topic} />
          ))}
        </div>
      )}

      {topicReadiness.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No documents in this plan yet.
        </div>
      )}
    </motion.div>
  );
}

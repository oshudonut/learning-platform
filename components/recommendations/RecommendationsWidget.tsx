"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Trophy, BookOpen, Target, RefreshCw, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Recommendation, RecommendationType } from "@/app/api/recommendations/route";

const TYPE_META: Record<
  RecommendationType,
  { icon: React.ElementType; color: string; bg: string; border: string }
> = {
  retry_quiz: {
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/8",
    border: "border-l-red-500",
  },
  start_quiz: {
    icon: Trophy,
    color: "text-violet-500",
    bg: "bg-violet-500/8",
    border: "border-l-violet-500",
  },
  continue_reading: {
    icon: BookOpen,
    color: "text-primary",
    bg: "bg-primary/8",
    border: "border-l-primary",
  },
  start_reading: {
    icon: BookOpen,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-l-muted-foreground/40",
  },
  review_weak_topics: {
    icon: Target,
    color: "text-amber-500",
    bg: "bg-amber-500/8",
    border: "border-l-amber-500",
  },
  revisit_mastered: {
    icon: RefreshCw,
    color: "text-emerald-500",
    bg: "bg-emerald-500/8",
    border: "border-l-emerald-500",
  },
};

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const meta = TYPE_META[rec.type];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border border-l-2 px-4 py-3 transition-colors hover:bg-muted/30",
        meta.border,
        meta.bg,
      )}
    >
      <div className={cn("flex-shrink-0", meta.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{rec.documentTitle}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{rec.reason}</p>
      </div>
      <Link
        href={rec.href}
        className={cn(
          "flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all",
          "hover:opacity-80",
          meta.color,
          "border-current/30 bg-background",
        )}
      >
        {rec.ctaLabel}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

export function RecommendationsWidget() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/recommendations")
      .then((r) => r.json())
      .then((data) => setRecs(data.recommendations ?? []))
      .catch(() => null)
      .finally(() => setReady(true));
  }, []);

  if (!ready || recs.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Recommended for you</h2>
      </div>
      <div className="space-y-2">
        {recs.map((rec, i) => (
          <RecommendationCard key={i} rec={rec} />
        ))}
      </div>
    </div>
  );
}

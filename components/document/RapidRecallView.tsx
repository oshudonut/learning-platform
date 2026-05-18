"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RapidRecallReviewer, RapidRecallDrillSet } from "@/lib/types";

const FLAG_STYLES: Record<string, string> = {
  MUST_KNOW: "bg-red-500/10 text-red-500 border-red-500/20",
  HIGH_YIELD: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  STANDARD: "bg-muted text-muted-foreground border-border",
};

function DrillSetBlock({ drillSet }: { drillSet: RapidRecallDrillSet }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  function toggle(index: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card/60">
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
        )}
        <span className="text-sm font-semibold text-foreground">{drillSet.topic}</span>
        <span className="ml-auto text-xs text-muted-foreground/50">{drillSet.items.length} items</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-2">
          {drillSet.items.map((item, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border transition-all duration-150",
                revealed.has(i)
                  ? "border-primary/20 bg-primary/5"
                  : "border-border bg-background/50 hover:border-border/80",
              )}
            >
              {/* Cue row */}
              <button
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                onClick={() => toggle(i)}
              >
                <span className="text-sm text-foreground/90 font-medium leading-snug">
                  {item.cue}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      "text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase tracking-wide",
                      FLAG_STYLES[item.flag] ?? FLAG_STYLES.STANDARD,
                    )}
                  >
                    {item.flag.replace("_", " ")}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {revealed.has(i) ? "hide" : "tap"}
                  </span>
                </div>
              </button>

              {/* Response row */}
              {revealed.has(i) && (
                <div className="border-t border-primary/10 px-3 py-2">
                  <p className="text-sm font-semibold text-primary">{item.response}</p>
                </div>
              )}
            </div>
          ))}

          {/* Reveal all button */}
          <button
            className="mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2"
            onClick={() => {
              const all = new Set(drillSet.items.map((_, i) => i));
              const allRevealed = drillSet.items.every((_, i) => revealed.has(i));
              setRevealed(allRevealed ? new Set() : all);
            }}
          >
            {drillSet.items.every((_, i) => revealed.has(i)) ? "Hide all" : "Reveal all"}
          </button>
        </div>
      )}
    </div>
  );
}

interface RapidRecallViewProps {
  data: RapidRecallReviewer;
}

export function RapidRecallView({ data }: RapidRecallViewProps) {
  const mustKnowCount = data.drillSets.reduce(
    (acc, ds) => acc + ds.items.filter((i) => i.flag === "MUST_KNOW").length,
    0,
  );
  const totalItems = data.drillSets.reduce((acc, ds) => acc + ds.items.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Zap className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{data.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{data.summary}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-muted-foreground">{mustKnowCount} must-know</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">{totalItems} total items</span>
        </div>
      </div>

      {/* Drill sets */}
      <div className="space-y-3">
        {data.drillSets.map((ds, i) => (
          <DrillSetBlock key={i} drillSet={ds} />
        ))}
      </div>
    </div>
  );
}

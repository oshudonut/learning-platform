"use client";

import { useState } from "react";
import { Check, SkipForward, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ITEM_TYPE_META } from "./itemTypeMeta";
import type { DailyBrief, ScoredItem } from "@/lib/planner";

type Props = {
  brief: DailyBrief;
  planId: string;
  onItemActioned?: (itemId: string) => void;
};

function ItemRow({
  item,
  planId,
  onActioned,
}: {
  item: ScoredItem;
  planId: string;
  onActioned: (id: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "completing" | "skipping" | "done" | "skipped">("idle");
  const meta = ITEM_TYPE_META[item.itemType];
  const Icon = meta.icon;

  async function act(action: "complete" | "skip") {
    setStatus(action === "complete" ? "completing" : "skipping");
    try {
      await fetch(`/api/planner/${planId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, itemId: item.id }),
      });
      setStatus(action === "complete" ? "done" : "skipped");
      setTimeout(() => onActioned(item.id), 600);
    } catch {
      setStatus("idle");
    }
  }

  const done = status === "done" || status === "skipped";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-l-2 px-4 py-3 transition-all",
        meta.border, meta.bg,
        done && "opacity-40",
      )}
    >
      <div className={cn("flex-shrink-0", meta.color)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground truncate">{item.documentTitle}</span>
          {item.isOverdue && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-500">
              <AlertTriangle className="h-2.5 w-2.5" />
              {item.daysPastDue}d overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{meta.label}</span>
          {item.sectionIndices.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              · sections {item.sectionIndices[0] + 1}–{item.sectionIndices[item.sectionIndices.length - 1] + 1}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
            <Clock className="h-2.5 w-2.5" />
            {item.estimatedMins}m
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {status === "done" ? (
          <span className="text-emerald-500"><Check className="h-4 w-4" /></span>
        ) : status === "skipped" ? (
          <span className="text-muted-foreground text-[10px]">Skipped</span>
        ) : (
          <>
            <button
              onClick={() => act("complete")}
              disabled={status !== "idle"}
              className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              Done
            </button>
            <button
              onClick={() => act("skip")}
              disabled={status !== "idle"}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <SkipForward className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function DailyChecklist({ brief, planId, onItemActioned }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function dismiss(id: string) {
    setHidden((prev) => new Set([...prev, id]));
    onItemActioned?.(id);
  }

  const overdueVisible = brief.overdueItems.filter((i) => !hidden.has(i.id));
  const todayVisible = brief.todayItems.filter((i) => !hidden.has(i.id));

  if (overdueVisible.length === 0 && todayVisible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <Check className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground">All caught up!</p>
        <p className="text-xs text-muted-foreground mt-1">No tasks scheduled for today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {overdueVisible.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-red-500 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Overdue ({overdueVisible.length})
          </p>
          <div className="space-y-2">
            {overdueVisible.map((item) => (
              <ItemRow key={item.id} item={item} planId={planId} onActioned={dismiss} />
            ))}
          </div>
        </div>
      )}

      {todayVisible.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Today ({todayVisible.length})
          </p>
          <div className="space-y-2">
            {todayVisible.map((item) => (
              <ItemRow key={item.id} item={item} planId={planId} onActioned={dismiss} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

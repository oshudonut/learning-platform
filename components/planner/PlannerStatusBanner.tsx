"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudyPlanItem } from "@/lib/types";

type NextItem = StudyPlanItem & { planId: string; planTitle: string };

type StatusBannerData = {
  nextItem: NextItem | null;
  overdueCount: number;
  daysUntilExam: number | null;
  examDate: number | null;
  planId: string | null;
};

function readinessLabel(daysLeft: number | null, overdue: number): { label: string; color: string } {
  if (daysLeft === null) return { label: "Not scheduled", color: "text-muted-foreground" };
  if (overdue > 0) return { label: "Behind schedule", color: "text-red-500" };
  if (daysLeft <= 7) return { label: "Exam week — stay focused", color: "text-amber-500" };
  if (daysLeft <= 30) return { label: "On track", color: "text-emerald-500" };
  return { label: "Well ahead", color: "text-primary" };
}

export function PlannerStatusBanner({ documentId }: { documentId: string }) {
  const [data, setData] = useState<StatusBannerData | null>(null);

  useEffect(() => {
    fetch("/api/planner/today")
      .then((r) => r.json())
      .then((res: { brief?: { todayItems: NextItem[]; overdueItems: NextItem[]; dueReviews: unknown[] } }) => {
        if (!res.brief) return;
        const { todayItems, overdueItems } = res.brief;

        // Find next item for this document across today + overdue
        const allItems = [...overdueItems, ...todayItems] as NextItem[];
        const docItems = allItems.filter((i) => i.documentId === documentId);
        const nextItem = docItems[0] ?? null;

        // Determine exam info from any item referencing an active plan
        // We don't have examDate directly in the brief, so leave it null for now
        setData({
          nextItem,
          overdueCount: (overdueItems as NextItem[]).filter((i) => i.documentId === documentId).length,
          daysUntilExam: null,
          examDate: null,
          planId: nextItem?.planId ?? null,
        });
      })
      .catch(() => null);
  }, [documentId]);

  if (!data || (!data.nextItem && data.overdueCount === 0)) return null;

  const { nextItem, overdueCount, daysUntilExam, planId } = data;
  const readiness = readinessLabel(daysUntilExam, overdueCount);

  return (
    <div className={cn(
      "rounded-xl border px-4 py-3 flex items-center gap-3 text-sm",
      overdueCount > 0
        ? "border-red-500/30 bg-red-500/5"
        : "border-primary/20 bg-primary/5",
    )}>
      <div className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
        overdueCount > 0 ? "bg-red-500/10" : "bg-primary/10",
      )}>
        {overdueCount > 0 ? (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        ) : (
          <CalendarDays className="h-4 w-4 text-primary" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {overdueCount > 0 ? (
          <p className="text-xs font-semibold text-red-500">
            {overdueCount} overdue task{overdueCount !== 1 ? "s" : ""} for this document
          </p>
        ) : nextItem ? (
          <p className="text-xs font-semibold text-foreground">
            Next up:{" "}
            <span className="capitalize">{nextItem.itemType.replace("_", " ")}</span>
            {nextItem.estimatedMins > 0 && (
              <span className="font-normal text-muted-foreground ml-1.5 inline-flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {nextItem.estimatedMins}m
              </span>
            )}
          </p>
        ) : null}
        <p className={cn("text-[10px] mt-0.5", readiness.color)}>{readiness.label}</p>
      </div>

      {planId && (
        <Link
          href={`/planner/${planId}`}
          className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-2.5 py-1.5 text-[10px] font-semibold"
        >
          <CheckCircle className="h-3 w-3" />
          Open Plan
        </Link>
      )}
    </div>
  );
}

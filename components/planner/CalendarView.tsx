"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ITEM_TYPE_META } from "./itemTypeMeta";
import type { StudyPlanItem } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function utcMidnight(ms: number) {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

type Props = {
  items: StudyPlanItem[];
  examDate: number;
  weeks?: number;
};

export function CalendarView({ items, examDate, weeks = 5 }: Props) {
  const { days, itemsByDay } = useMemo(() => {
    const today = utcMidnight(Date.now());

    // Start grid from the Sunday on or before today
    const startDow = new Date(today).getDay(); // 0=Sun
    const gridStart = today - startDow * DAY_MS;
    const totalDays = weeks * 7;

    const days: number[] = Array.from({ length: totalDays }, (_, i) => gridStart + i * DAY_MS);

    const itemsByDay: Record<number, StudyPlanItem[]> = {};
    for (const item of items) {
      const d = utcMidnight(item.scheduledDate);
      if (!itemsByDay[d]) itemsByDay[d] = [];
      itemsByDay[d].push(item);
    }

    return { days, itemsByDay };
  }, [items, weeks]);

  const today = utcMidnight(Date.now());
  const examDay = utcMidnight(examDate);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((dayMs) => {
          const dayItems = itemsByDay[dayMs] ?? [];
          const isToday = dayMs === today;
          const isPast = dayMs < today;
          const isExam = dayMs === examDay;
          const date = new Date(dayMs);

          // Pick up to 3 dots by unique item type
          const typesSeen = new Set<string>();
          const dots = dayItems.filter((i) => {
            if (typesSeen.has(i.itemType)) return false;
            typesSeen.add(i.itemType);
            return true;
          }).slice(0, 3);

          return (
            <div
              key={dayMs}
              className={cn(
                "relative flex flex-col items-center rounded-lg py-1.5 px-0.5 min-h-[52px] transition-colors",
                isToday && "ring-1 ring-primary bg-primary/5",
                isExam && "ring-1 ring-red-500 bg-red-500/5",
                isPast && !isToday && "opacity-40",
                !isPast && !isToday && dayItems.length > 0 && "bg-muted/30",
              )}
            >
              <span className={cn(
                "text-[11px] font-medium leading-none mb-1",
                isToday ? "text-primary font-bold" : "text-foreground/70",
                isExam && "text-red-500 font-bold",
              )}>
                {date.getUTCDate()}
              </span>

              {isExam && (
                <span className="text-[8px] font-bold text-red-500 leading-none mb-0.5">EXAM</span>
              )}

              {/* Item type dots */}
              {dots.length > 0 && (
                <div className="flex gap-0.5 flex-wrap justify-center">
                  {dots.map((item, i) => {
                    const meta = ITEM_TYPE_META[item.itemType];
                    return (
                      <span
                        key={i}
                        className={cn("h-1.5 w-1.5 rounded-full", meta.color.replace("text-", "bg-"))}
                        title={meta.label}
                      />
                    );
                  })}
                  {dayItems.length > 3 && (
                    <span className="text-[8px] text-muted-foreground leading-none self-center">
                      +{dayItems.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {(["read_sections", "quiz", "remediation", "retention_review"] as const).map((type) => {
          const meta = ITEM_TYPE_META[type];
          const hasDot = meta.color.replace("text-", "bg-");
          return (
            <div key={type} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", hasDot)} />
              <span className="text-[10px] text-muted-foreground">{meta.label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1 ml-auto">
          <span className="h-2 w-2 rounded-sm ring-1 ring-red-500 bg-red-500/10" />
          <span className="text-[10px] text-muted-foreground">Exam</span>
        </div>
      </div>
    </div>
  );
}

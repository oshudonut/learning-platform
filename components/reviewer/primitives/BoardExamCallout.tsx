"use client";

import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalloutVariant = "amber" | "blue" | "emerald" | "red" | "muted";

const STYLES: Record<CalloutVariant, { box: string; label: string; icon: string; badge: string }> = {
  amber: {
    box:   "border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20",
    label: "text-amber-700 dark:text-amber-400",
    icon:  "text-amber-500 dark:text-amber-400",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  blue: {
    box:   "border-sky-200 dark:border-sky-800/40 bg-sky-50 dark:bg-sky-950/20",
    label: "text-sky-700 dark:text-sky-400",
    icon:  "text-sky-500 dark:text-sky-400",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  emerald: {
    box:   "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20",
    label: "text-emerald-700 dark:text-emerald-400",
    icon:  "text-emerald-500 dark:text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  red: {
    box:   "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20",
    label: "text-red-700 dark:text-red-400",
    icon:  "text-red-500 dark:text-red-400",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  muted: {
    box:   "border-border bg-muted/30",
    label: "text-muted-foreground",
    icon:  "text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
  },
};

interface BoardExamCalloutProps {
  variant: CalloutVariant;
  label: string;
  icon?: LucideIcon;
  badge?: string;
  className?: string;
  children: React.ReactNode;
}

export function BoardExamCallout({
  variant,
  label,
  icon: Icon,
  badge,
  className,
  children,
}: BoardExamCalloutProps) {
  const s = STYLES[variant];
  return (
    <div className={cn("rounded-lg border p-3", s.box, className)}>
      <div className="flex items-center gap-1.5 mb-2.5">
        {Icon && <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", s.icon)} />}
        <span className={cn("text-[10px] font-bold uppercase tracking-widest", s.label)}>
          {label}
        </span>
        {badge && (
          <span className={cn("ml-auto text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded", s.badge)}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

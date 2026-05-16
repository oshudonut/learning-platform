"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AcademicBulletList<T>({
  items,
  renderItem,
  ordered = false,
  className,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  ordered?: boolean;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {ordered ? (
            <span className="flex-shrink-0 mt-0.5 min-w-[1.25rem] font-bold text-foreground/50 text-xs">
              {i + 1}.
            </span>
          ) : (
            <span className="flex-shrink-0 mt-[0.45rem] h-1.5 w-1.5 rounded-full bg-foreground/40" />
          )}
          <span className="leading-snug flex-1 min-w-0">
            {renderItem(item, i)}
          </span>
        </li>
      ))}
    </ul>
  );
}

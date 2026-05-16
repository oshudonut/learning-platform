"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionLabelVariant = "plain" | "cyan" | "blue";

export function SectionLabel({
  children,
  variant = "plain",
  className,
}: {
  children: ReactNode;
  variant?: SectionLabelVariant;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-bold uppercase tracking-widest mb-1.5",
        variant === "plain" && "text-foreground/80",
        variant === "cyan" && "text-cyan-600 dark:text-cyan-400",
        variant === "blue" && "text-blue-600 dark:text-blue-400",
        className,
      )}
    >
      {children}
    </p>
  );
}

"use client";

import { cn } from "@/lib/utils";
import { formatBoardText } from "./formatBoardText";

// Prefix patterns that appear at the start of mustMemorize / keyPoints strings.
// These are produced by the AI prompt labeling convention.
// Each entry: { pattern to detect, badge text, Tailwind classes }
const LABELS = [
  {
    pattern: /^HIGH-YIELD:\s*/i,
    badge: "HIGH-YIELD",
    cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  },
  {
    pattern: /^BOARD FAVORITE:\s*/i,
    badge: "BOARD FAV",
    cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  },
  {
    pattern: /^DX:\s*/i,
    badge: "DX",
    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  {
    pattern: /^TX:\s*/i,
    badge: "TX",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    pattern: /^S\/S:\s*/i,
    badge: "S/S",
    cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  {
    pattern: /^COMPLICATION:\s*/i,
    badge: "COMPLICATION",
    cls: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  {
    pattern: /^IMAGING:\s*/i,
    badge: "IMAGING",
    cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
] as const;

/**
 * Renders a string that may begin with a semantic prefix label (DX:, TX:, S/S:,
 * HIGH-YIELD:, etc.) as a colored inline badge + styled text. Falls back to plain
 * formatBoardText rendering when no prefix is found — so old cached reviewer JSON
 * that lacks prefix labels continues to render correctly.
 */
export function SemanticLabel({ text }: { text: string }) {
  for (const { pattern, badge, cls } of LABELS) {
    if (pattern.test(text)) {
      const rest = text.replace(pattern, "");
      return (
        <>
          <span
            className={cn(
              "inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded mr-1.5 align-middle",
              cls,
            )}
          >
            {badge}
          </span>
          {formatBoardText(rest)}
        </>
      );
    }
  }
  return <>{formatBoardText(text)}</>;
}

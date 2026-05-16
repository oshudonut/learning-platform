"use client";

import { cn } from "@/lib/utils";

const TAG_STYLES: Record<string, string> = {
  TRAP:  "bg-red-500/15 text-red-600 dark:text-red-400",
  TRICK: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  PEARL: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  TIP:   "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

function parseTip(tip: string): { tag: string; text: string } {
  const match = tip.match(/^\[(TRAP|TRICK|PEARL)\]\s*/i);
  if (match) {
    return { tag: match[1].toUpperCase(), text: tip.slice(match[0].length) };
  }
  return { tag: "TIP", text: tip };
}

interface BoardTipStripProps {
  tips: string[];
}

export function BoardTipStrip({ tips }: BoardTipStripProps) {
  if (!tips.length) return null;
  return (
    <div className="border-l-[3px] border-sky-400/60 pl-3 space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
        Board Tips
      </span>
      {tips.map((tip, i) => {
        const { tag, text } = parseTip(tip);
        return (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded mt-0.5",
                TAG_STYLES[tag] ?? TAG_STYLES.TIP,
              )}
            >
              {tag}
            </span>
            <span className="text-foreground/80 leading-snug">{text}</span>
          </div>
        );
      })}
    </div>
  );
}

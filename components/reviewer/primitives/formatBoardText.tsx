import React from "react";

/**
 * Applies lightweight inline styling to board-exam bullet text.
 * Styles arrows (→ ↑ ↓) and numeric thresholds/values.
 * Falls back to plain string for text with no special characters.
 */
export function formatBoardText(text: string): React.ReactNode {
  if (!text) return null;
  if (!/[→↑↓]|\d/.test(text)) return text;

  const parts = text.split(/(→|↑|↓|\b\d+(?:\.\d+)?(?:\s*%|\s*mg\/?\w*|\s*mmHg|\s*mEq\/?\w*|\s*mmol\/?\w*|\s*IU|\s*U\/\w+|\s*bpm)?)/g);

  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) => {
        if (part === "→") {
          return <span key={i} className="text-primary/80 font-medium mx-0.5">→</span>;
        }
        if (part === "↑") {
          return <span key={i} className="text-emerald-600 dark:text-emerald-400 font-semibold">↑</span>;
        }
        if (part === "↓") {
          return <span key={i} className="text-rose-500 dark:text-rose-400 font-semibold">↓</span>;
        }
        if (/^\d/.test(part)) {
          return <strong key={i} className="text-amber-700 dark:text-amber-400 font-semibold">{part}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

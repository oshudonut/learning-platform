"use client";

interface DiffRow {
  item: string;
  distinction: string;
}

interface DiffTableProps {
  rows: DiffRow[];
  leftLabel?: string;
  rightLabel?: string;
}

export function DiffTable({
  rows,
  leftLabel = "Don't confuse",
  rightLabel = "Key difference",
}: DiffTableProps) {
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-2 text-[10px] font-bold uppercase tracking-widest">
        <div className="bg-red-50 dark:bg-red-950/30 border-r border-border px-3 py-1.5 text-red-600 dark:text-red-400">
          ✗ {leftLabel}
        </div>
        <div className="bg-green-50 dark:bg-green-950/30 px-3 py-1.5 text-green-700 dark:text-green-400">
          ✓ {rightLabel}
        </div>
      </div>
      {/* Data rows */}
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-2 border-t border-border text-sm"
        >
          <div className="bg-red-50/60 dark:bg-red-950/20 border-r border-border px-3 py-2 font-semibold text-red-700 dark:text-red-300">
            {row.item}
          </div>
          <div className="bg-green-50/60 dark:bg-green-950/20 px-3 py-2 text-green-800 dark:text-green-200">
            {row.distinction}
          </div>
        </div>
      ))}
    </div>
  );
}

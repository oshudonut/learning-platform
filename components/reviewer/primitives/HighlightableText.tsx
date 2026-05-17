"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatBoardText } from "./formatBoardText";
import type { ReviewerHighlight } from "@/lib/store";

// ── Prefix detection (mirrors SemanticLabel patterns) ────────────────────────

type LabelEntry = {
  pattern: RegExp;
  badge: string;
  cls: string;
};

const LABELS: LabelEntry[] = [
  { pattern: /^HIGH-YIELD:\s*/i,    badge: "HIGH-YIELD",   cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  { pattern: /^BOARD FAVORITE:\s*/i, badge: "BOARD FAV",   cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  { pattern: /^DX:\s*/i,            badge: "DX",           cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { pattern: /^TX:\s*/i,            badge: "TX",           cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { pattern: /^S\/S:\s*/i,          badge: "S/S",          cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  { pattern: /^COMPLICATION:\s*/i,   badge: "COMPLICATION", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  { pattern: /^IMAGING:\s*/i,        badge: "IMAGING",      cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
];

function detectPrefix(text: string): { prefixLen: number; badge: string; cls: string } | null {
  for (const { pattern, badge, cls } of LABELS) {
    const m = pattern.exec(text);
    if (m) return { prefixLen: m[0].length, badge, cls };
  }
  return null;
}

// ── Char offset helpers ───────────────────────────────────────────────────────

function getCharOffset(root: Element, targetNode: Node, offsetInNode: number): number {
  const iter = document.createNodeIterator(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let node: Node | null;
  while ((node = iter.nextNode())) {
    if (node === targetNode) return count + offsetInNode;
    count += node.textContent?.length ?? 0;
  }
  return -1;
}

// ── Segment building ──────────────────────────────────────────────────────────

type Segment = {
  text: string;
  highlight: ReviewerHighlight | null;
};

function buildSegments(
  bodyText: string,
  highlights: ReviewerHighlight[],
  prefixLen: number,
): Segment[] {
  const active = highlights
    .map((h) => ({
      h,
      s: Math.max(0, h.charStart - prefixLen),
      e: Math.min(bodyText.length, h.charEnd - prefixLen),
    }))
    .filter(({ s, e }) => e > s && s < bodyText.length)
    .sort((a, b) => a.s - b.s);

  const segments: Segment[] = [];
  let pos = 0;
  for (const { h, s, e } of active) {
    if (s > pos) segments.push({ text: bodyText.slice(pos, s), highlight: null });
    segments.push({ text: bodyText.slice(s, e), highlight: h });
    pos = e;
  }
  if (pos < bodyText.length) segments.push({ text: bodyText.slice(pos), highlight: null });
  return segments.length > 0 ? segments : [{ text: bodyText, highlight: null }];
}

// ── Color styles ──────────────────────────────────────────────────────────────

const MARK_CLS: Record<string, string> = {
  yellow: "bg-yellow-200/80 dark:bg-yellow-500/35",
  green:  "bg-green-200/80 dark:bg-green-500/35",
  blue:   "bg-blue-200/80 dark:bg-blue-500/35",
  pink:   "bg-pink-200/80 dark:bg-pink-500/35",
};

const PICKER_CLS: Record<string, string> = {
  yellow: "bg-yellow-300 hover:bg-yellow-400 dark:bg-yellow-500 dark:hover:bg-yellow-400",
  green:  "bg-green-300 hover:bg-green-400 dark:bg-green-600 dark:hover:bg-green-500",
  blue:   "bg-blue-300 hover:bg-blue-400 dark:bg-blue-600 dark:hover:bg-blue-500",
  pink:   "bg-pink-300 hover:bg-pink-400 dark:bg-pink-600 dark:hover:bg-pink-500",
};

// ── Component ─────────────────────────────────────────────────────────────────

type PickerState = { x: number; y: number; charStart: number; charEnd: number };

export type HighlightableTextProps = {
  text: string;
  highlights: ReviewerHighlight[];
  documentId: string;
  topicIndex: number;
  fieldName: string;
  itemIndex?: number;
  onHighlightCreated: (h: ReviewerHighlight) => void;
  onHighlightDeleted: (id: string) => void;
};

export function HighlightableText({
  text,
  highlights,
  documentId,
  topicIndex,
  fieldName,
  itemIndex = 0,
  onHighlightCreated,
  onHighlightDeleted,
}: HighlightableTextProps) {
  const prefixInfo = detectPrefix(text);
  const prefixLen = prefixInfo?.prefixLen ?? 0;
  const bodyText = text.slice(prefixLen);

  const bodyRef = useRef<HTMLSpanElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [saving, setSaving] = useState(false);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyRef.current) return;
    const range = sel.getRangeAt(0);
    if (!bodyRef.current.contains(range.commonAncestorContainer)) return;

    const start = getCharOffset(bodyRef.current, range.startContainer, range.startOffset);
    const end   = getCharOffset(bodyRef.current, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || start >= end) return;

    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    if (!last) return;

    setPicker({ x: last.left + last.width / 2, y: last.bottom, charStart: start + prefixLen, charEnd: end + prefixLen });
  }, [prefixLen]);

  // Dismiss picker on outside click
  useEffect(() => {
    if (!picker) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current?.contains(e.target as Node)) return;
      setPicker(null);
      window.getSelection()?.removeAllRanges();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [picker]);

  async function handleColorPick(color: string) {
    if (!picker || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId,
          topicIndex,
          fieldName,
          itemIndex,
          charStart: picker.charStart,
          charEnd: picker.charEnd,
          colorTag: color,
        }),
      });
      const data = await res.json() as { highlight?: ReviewerHighlight };
      if (data.highlight) {
        onHighlightCreated(data.highlight);
        window.getSelection()?.removeAllRanges();
        setPicker(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch("/api/highlights", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onHighlightDeleted(id);
  }

  const segments = buildSegments(bodyText, highlights, prefixLen);

  return (
    <span className="select-text" onMouseUp={handleMouseUp}>
      {/* Prefix badge — identical rendering to SemanticLabel */}
      {prefixInfo && (
        <span
          className={cn(
            "inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded mr-1.5 align-middle",
            prefixInfo.cls,
          )}
        >
          {prefixInfo.badge}
        </span>
      )}

      {/* Body text with highlight marks */}
      <span ref={bodyRef}>
        {segments.map((seg, i) => {
          const content = formatBoardText(seg.text);
          if (!seg.highlight) {
            return <React.Fragment key={i}>{content}</React.Fragment>;
          }
          const h = seg.highlight;
          return (
            <mark
              key={i}
              className={cn(
                "rounded-sm cursor-pointer transition-opacity",
                MARK_CLS[h.colorTag] ?? MARK_CLS.yellow,
                h.isStale && "opacity-40 line-through decoration-dashed",
              )}
              title={h.isStale ? "Stale — reviewer was regenerated. Click to remove." : "Click to remove highlight"}
              onClick={() => void handleDelete(h.id)}
            >
              {content}
            </mark>
          );
        })}
      </span>

      {/* Color picker popover */}
      {picker && (
        <div
          ref={pickerRef}
          className="fixed z-50 flex items-center gap-1 p-1.5 rounded-lg shadow-xl border border-border bg-background"
          style={{ left: picker.x - 72, top: picker.y + 6 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {(["yellow", "green", "blue", "pink"] as const).map((color) => (
            <button
              key={color}
              onClick={() => void handleColorPick(color)}
              disabled={saving}
              aria-label={`Highlight ${color}`}
              className={cn(
                "h-5 w-5 rounded-full transition-transform hover:scale-110 disabled:opacity-50",
                PICKER_CLS[color],
              )}
            />
          ))}
          <button
            onClick={() => { setPicker(null); window.getSelection()?.removeAllRanges(); }}
            className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground text-xs leading-none"
            aria-label="Cancel"
          >
            ×
          </button>
        </div>
      )}
    </span>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, FileText, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptPage } from "@/lib/types";

interface TranscriptPageBlockProps {
  page: TranscriptPage;
  active: boolean;
  onActivate: () => void;
}

export function TranscriptPageBlock({ page, active, onActivate }: TranscriptPageBlockProps) {
  const [collapsed, setCollapsed] = useState(false);

  function handleHeaderClick() {
    onActivate();
    setCollapsed((c) => !c);
  }

  return (
    <div
      id={page.id}
      className={cn(
        "rounded-xl border transition-all duration-150",
        active
          ? "border-primary/30 bg-primary/5 shadow-sm shadow-primary/10"
          : "border-border bg-card/40 hover:border-border",
        page.empty && "opacity-50",
      )}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={handleHeaderClick}
      >
        <span className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded bg-muted">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        </span>

        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground truncate">
            {page.title}
          </span>
          {page.charCount > 0 && (
            <span className="text-xs text-muted-foreground/50 flex-shrink-0">
              {page.charCount.toLocaleString()} chars
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {page.lowConfidence && (
            <span className="text-[9px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
              Low confidence
            </span>
          )}
          {page.malformed && (
            <span className="text-[9px] font-semibold text-red-500 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
              Malformed
            </span>
          )}
          {page.ocrSource && (
            <span className="text-[9px] font-semibold text-sky-500 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded">
              OCR
            </span>
          )}
          {/* Notes indicator */}
          {active && (
            <span className="h-5 w-5 flex items-center justify-center rounded text-primary" title="Active page for notes">
              <PenLine className="h-3 w-3" />
            </span>
          )}
          {collapsed
            ? <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
          }
        </div>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">
              <div className="border-t border-border/40 pt-3">
                {page.empty ? (
                  <p className="text-sm text-muted-foreground/40 italic">Empty page</p>
                ) : (
                  <pre className="text-sm text-foreground/75 leading-relaxed whitespace-pre-wrap font-sans max-h-[28rem] overflow-y-auto scrollbar-thin scrollbar-thumb-border">
                    {page.content}
                  </pre>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

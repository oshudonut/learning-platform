"use client";

import { useState, useRef, useCallback, memo } from "react";
import { FileText, ChevronDown, ChevronRight, ExternalLink, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAnchors } from "@/lib/anchor-resolver";
import type { SourceAnchor, RawTranscript } from "@/lib/types";
import type { ResolvedAnchor, AnchorConfidence, AnchorDiagnostics } from "@/lib/anchor-resolver";

// ─── Confidence display config ────────────────────────────────────────────────

const CONFIDENCE_CONFIG: Record<AnchorConfidence, { label: string; cls: string }> = {
  exact_section_match: {
    label: "High",
    cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  fuzzy_quote_match: {
    label: "Medium",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  page_only_match: {
    label: "Low",
    cls: "bg-muted text-muted-foreground border-border",
  },
  unresolved: {
    label: "Unresolved",
    cls: "bg-red-500/15 text-red-500 border-red-500/20",
  },
};

const MAX_VISIBLE = 3;
const EXCERPT_MAX_CHARS = 220;

function truncateExcerpt(text: string): string {
  if (text.length <= EXCERPT_MAX_CHARS) return text;
  return text.slice(0, EXCERPT_MAX_CHARS).trimEnd() + "…";
}

// ─── Dev diagnostics ──────────────────────────────────────────────────────────
// Module-level so metrics accumulate across component mount/unmount cycles.

const _devStats = {
  openCount: 0,
  latencyMs: [] as number[],
  unresolvedTotal: 0,
  resolvedTotal: 0,
};

function logDevOpen(topicId: string, latency: number, d: AnchorDiagnostics) {
  if (process.env.NODE_ENV === "production") return;
  _devStats.openCount++;
  _devStats.latencyMs.push(latency);
  _devStats.unresolvedTotal += d.unresolved;
  _devStats.resolvedTotal += d.resolved;
  const unresolvedRatio =
    d.total > 0 ? ((d.unresolved / d.total) * 100).toFixed(0) + "%" : "n/a";
  console.log("[source-panel]", {
    topicId,
    latencyMs: latency,
    ...d,
    unresolvedRatio,
    sessionOpens: _devStats.openCount,
  });
}

// ─── EvidenceCard ─────────────────────────────────────────────────────────────

function EvidenceCard({
  anchor,
  onNavigate,
}: {
  anchor: ResolvedAnchor;
  onNavigate?: (pageId: string) => void;
}) {
  const conf = CONFIDENCE_CONFIG[anchor.confidence];

  return (
    <div className="rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5 space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 flex-shrink-0" />
          {anchor.title
            ? `p.​${anchor.pageNumber} — ${anchor.title}`
            : `Page ${anchor.pageNumber}`}
        </span>

        <span
          className={cn(
            "ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide",
            conf.cls,
          )}
        >
          {conf.label}
        </span>

        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(anchor.pageId)}
            className="flex items-center gap-0.5 text-primary/70 hover:text-primary transition-colors"
            title="Open in transcript"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Excerpt — monospace blockquote */}
      {anchor.matchedText && (
        <blockquote className="font-mono text-[11px] leading-relaxed text-foreground/65 border-l-2 border-primary/25 pl-2 break-words">
          {truncateExcerpt(anchor.matchedText)}
        </blockquote>
      )}
    </div>
  );
}

// ─── SourceEvidencePanel ──────────────────────────────────────────────────────

export interface SourceEvidencePanelProps {
  sourceAnchors: SourceAnchor[];
  transcript: RawTranscript;
  topicId: string;
  onNavigateToPage?: (pageId: string) => void;
  onOpen?: (resolvedCount: number, totalCount: number) => void;
}

function SourceEvidencePanelInner({
  sourceAnchors,
  transcript,
  topicId,
  onNavigateToPage,
  onOpen,
}: SourceEvidencePanelProps) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<ResolvedAnchor[] | null>(null);
  const [diagnostics, setDiagnostics] = useState<AnchorDiagnostics | null>(null);

  // Prevent double-resolution when component re-renders while open
  const hasResolved = useRef(false);

  const validAnchors = sourceAnchors.filter((a) => Boolean(a.pageId));

  const handleToggle = useCallback(() => {
    if (!open && !hasResolved.current) {
      const t0 = performance.now();
      const { resolved: r, diagnostics: d } = resolveAnchors(validAnchors, transcript);
      const latency = Math.round(performance.now() - t0);
      hasResolved.current = true;
      setResolved(r);
      setDiagnostics(d);
      logDevOpen(topicId, latency, d);
      // Fire learning signal hook on first open
      onOpen?.(d.resolved, d.total);
    }
    setOpen((v) => !v);
  }, [open, validAnchors, transcript, topicId, onOpen]);

  if (validAnchors.length === 0) return null;

  // Resolved anchors visible to user: hide unresolved by default
  const visibleAnchors = resolved
    ? resolved.filter((r) => r.confidence !== "unresolved").slice(0, MAX_VISIBLE)
    : null;

  const overflowCount =
    diagnostics && diagnostics.resolved > MAX_VISIBLE
      ? diagnostics.resolved - MAX_VISIBLE
      : 0;

  return (
    <div className="mt-4 pt-3 border-t border-border/40">
      {/* Toggle */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors rounded px-0.5"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <FileText className="h-3 w-3" />
        View Source
        {diagnostics && diagnostics.resolved > 0 && (
          <span className="bg-muted px-1.5 py-0.5 rounded-full text-[10px]">
            {diagnostics.resolved}
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="mt-2.5 space-y-2">
          {/* Loading / not yet resolved */}
          {visibleAnchors === null && (
            <p className="text-xs text-muted-foreground/60 italic">Resolving sources…</p>
          )}

          {/* Nothing resolved */}
          {visibleAnchors !== null && visibleAnchors.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">
              No source excerpts available for this topic.
            </p>
          )}

          {/* Evidence cards */}
          {visibleAnchors !== null &&
            visibleAnchors.map((r, i) => (
              <EvidenceCard
                key={`${r.pageId}-${r.sectionId ?? i}`}
                anchor={r}
                onNavigate={onNavigateToPage}
              />
            ))}

          {/* Overflow indicator */}
          {overflowCount > 0 && (
            <p className="text-[10px] text-muted-foreground/50 pl-1">
              +{overflowCount} more source{overflowCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const SourceEvidencePanel = memo(SourceEvidencePanelInner);

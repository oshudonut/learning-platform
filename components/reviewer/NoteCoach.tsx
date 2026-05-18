"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  GraduationCap,
  Lightbulb,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteCoachResult } from "@/app/api/notes/coach/route";

// ── Client-side cache (initial analyses only — rechecks are never cached) ────
const coachCache = new Map<string, NoteCoachResult>();

function cacheKey(text: string): string {
  return text.trim().slice(0, 60);
}

// ── Relative time ─────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Section definitions ───────────────────────────────────────────────────────

type SectionDef = {
  key: keyof NoteCoachResult;
  label: string;
  Icon: React.FC<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  recheckOnly?: boolean;
};

// Recheck comparison sections — shown first when available
const RECHECK_SECTIONS: SectionDef[] = [
  {
    key: "improvementDetected",
    label: "Improvement Detected",
    Icon: TrendingUp,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/8 border-emerald-500/20",
    recheckOnly: true,
  },
  {
    key: "remainingWeakness",
    label: "Still Needs Work",
    Icon: AlertOctagon,
    colorClass: "text-orange-500 dark:text-orange-400",
    bgClass: "bg-orange-500/8 border-orange-500/20",
    recheckOnly: true,
  },
  {
    key: "confidenceShift",
    label: "Confidence Shift",
    Icon: ArrowUpRight,
    colorClass: "text-sky-600 dark:text-sky-400",
    bgClass: "bg-sky-500/8 border-sky-500/20",
    recheckOnly: true,
  },
  {
    key: "nextLevelInsight",
    label: "Next Level",
    Icon: Brain,
    colorClass: "text-violet-600 dark:text-violet-400",
    bgClass: "bg-violet-500/8 border-violet-500/20",
    recheckOnly: true,
  },
];

// Core analysis sections — always eligible
const ANALYSIS_SECTIONS: SectionDef[] = [
  {
    key: "correction",
    label: "Correction",
    Icon: AlertTriangle,
    colorClass: "text-red-500 dark:text-red-400",
    bgClass: "bg-red-500/8 border-red-500/20",
  },
  {
    key: "clarification",
    label: "Clarification",
    Icon: BookOpen,
    colorClass: "text-sky-500 dark:text-sky-400",
    bgClass: "bg-sky-500/8 border-sky-500/20",
  },
  {
    key: "suggestedRewrite",
    label: "Clearer Phrasing",
    Icon: PenLine,
    colorClass: "text-violet-500 dark:text-violet-400",
    bgClass: "bg-violet-500/8 border-violet-500/20",
  },
  {
    key: "examTip",
    label: "Exam Tip",
    Icon: GraduationCap,
    colorClass: "text-amber-500 dark:text-amber-400",
    bgClass: "bg-amber-500/8 border-amber-500/20",
  },
  {
    key: "retentionHook",
    label: "Memory Hook",
    Icon: Lightbulb,
    colorClass: "text-emerald-500 dark:text-emerald-400",
    bgClass: "bg-emerald-500/8 border-emerald-500/20",
  },
];

const ALL_SECTIONS = [...RECHECK_SECTIONS, ...ANALYSIS_SECTIONS];

// ── State machine ─────────────────────────────────────────────────────────────

type DoneState = {
  status: "done";
  result: NoteCoachResult;
  checkedAt: number;
  isRecheck: boolean;
};

type CoachState =
  | { status: "idle" }
  | { status: "loading" }
  | DoneState
  | { status: "rechecking"; staleResult: NoteCoachResult; checkedAt: number }
  | { status: "limited" }
  | { status: "error" };

// ── Props ─────────────────────────────────────────────────────────────────────

export type NoteCoachTopic = {
  title: string;
  coreIdea: string;
  keyPoints: string[];
  mustMemorize: string[];
  boardTips: string[];
};

type NoteCoachProps = {
  noteText: string;
  topic: NoteCoachTopic;
  studyMode?: string;
  onApplyRewrite?: (text: string) => void;
};

const MIN_CHARS = 20;
const DEBOUNCE_MS = 1500;

// ── Component ─────────────────────────────────────────────────────────────────

export function NoteCoach({ noteText, topic, studyMode, onApplyRewrite }: NoteCoachProps) {
  const [state, setState] = useState<CoachState>({ status: "idle" });
  const [collapsed, setCollapsed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [unchanged, setUnchanged] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  // Tracks the note text that produced the current "done" result
  const lastAnalyzedNoteRef = useRef<string>("");

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // ── Auto-debounce (initial analysis) ───────────────────────────────────────

  useEffect(() => {
    const text = noteText.trim();

    if (text.length < MIN_CHARS) {
      setState({ status: "idle" });
      return;
    }

    // Don't interrupt an in-progress manual recheck
    if (state.status === "rechecking") return;

    const key = cacheKey(text);
    const cached = coachCache.get(key);
    if (cached) {
      lastAnalyzedNoteRef.current = text;
      setState({ status: "done", result: cached, checkedAt: Date.now(), isRecheck: false });
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!isMounted.current) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setState({ status: "loading" });

      try {
        const res = await fetch("/api/notes/coach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            noteText: text,
            mode: "initial",
            topicTitle: topic.title,
            topicContent: {
              coreIdea: topic.coreIdea,
              keyPoints: topic.keyPoints,
              mustMemorize: topic.mustMemorize,
              boardTips: topic.boardTips,
            },
            studyMode,
          }),
          signal: ctrl.signal,
        });

        if (!isMounted.current) return;

        if (!res.ok) { setState({ status: "error" }); return; }

        const data = await res.json() as { result: NoteCoachResult | null; limited?: boolean };
        if (!isMounted.current) return;

        if (data.limited) { setState({ status: "limited" }); return; }
        if (!data.result) { setState({ status: "idle" }); return; }

        coachCache.set(key, data.result);
        lastAnalyzedNoteRef.current = text;
        setState({ status: "done", result: data.result, checkedAt: Date.now(), isRecheck: false });
        setCollapsed(false);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (isMounted.current) setState({ status: "error" });
      }
    }, DEBOUNCE_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteText]);

  // ── Manual recheck ────────────────────────────────────────────────────────

  const handleRecheck = useCallback(async () => {
    const current = noteText.trim();
    if (current === lastAnalyzedNoteRef.current) {
      setUnchanged(true);
      setTimeout(() => setUnchanged(false), 2000);
      return;
    }

    const previous = lastAnalyzedNoteRef.current;

    // Preserve stale result during recheck
    const staleResult = state.status === "done" || state.status === "rechecking"
      ? (state.status === "done" ? state.result : state.staleResult)
      : null;

    if (staleResult) {
      setState({ status: "rechecking", staleResult, checkedAt: (state as DoneState).checkedAt ?? Date.now() });
    } else {
      setState({ status: "loading" });
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/notes/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          noteText: current,
          previousNoteText: previous,
          mode: "recheck",
          topicTitle: topic.title,
          topicContent: {
            coreIdea: topic.coreIdea,
            keyPoints: topic.keyPoints,
            mustMemorize: topic.mustMemorize,
            boardTips: topic.boardTips,
          },
          studyMode,
        }),
        signal: ctrl.signal,
      });

      if (!isMounted.current) return;

      if (!res.ok) { setState({ status: "error" }); return; }

      const data = await res.json() as { result: NoteCoachResult | null; limited?: boolean };
      if (!isMounted.current) return;

      if (data.limited) { setState({ status: "limited" }); return; }
      if (!data.result) { setState({ status: "error" }); return; }

      lastAnalyzedNoteRef.current = current;
      setState({ status: "done", result: data.result, checkedAt: Date.now(), isRecheck: true });
      setCollapsed(false);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      if (isMounted.current) setState({ status: "error" });
    }
  }, [noteText, state, topic, studyMode]);

  // ── Derived display ───────────────────────────────────────────────────────

  const isLoading = state.status === "loading";
  const isRechecking = state.status === "rechecking";
  const isDone = state.status === "done";

  const displayResult: NoteCoachResult | null =
    isDone ? state.result
    : isRechecking ? state.staleResult
    : null;

  const activeSections = displayResult
    ? ALL_SECTIONS.filter((s) => displayResult[s.key])
    : [];

  const noteChanged = noteText.trim() !== lastAnalyzedNoteRef.current
    && lastAnalyzedNoteRef.current.length > 0;

  const checkedAt = isDone ? state.checkedAt : isRechecking ? state.checkedAt : null;

  if (state.status === "idle") return null;
  if (isDone && activeSections.length === 0 && !isRechecking) return null;

  return (
    <div className={cn(
      "mt-3 rounded-xl border overflow-hidden",
      "bg-gradient-to-b from-primary/4 to-transparent border-primary/15",
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
        <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-[11px] font-semibold text-primary flex-1 uppercase tracking-wider">
          AI Study Coach
          {isDone && state.isRecheck && (
            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-wide normal-case">
              Recheck
            </span>
          )}
        </span>

        {/* Timestamp */}
        {checkedAt && !isLoading && !isRechecking && (
          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
            {timeAgo(checkedAt)}
          </span>
        )}

        {(isLoading || isRechecking) && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
        )}

        {isDone && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
        )}

        {(state.status === "error" || state.status === "limited") && (
          <button
            onClick={() => setState({ status: "idle" })}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Rechecking banner — shown on top of stale result */}
      {isRechecking && (
        <div className="px-3 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
          <span className="text-[11px] text-primary/80">Comparing with your previous note…</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Analyzing your note…
        </div>
      )}

      {state.status === "limited" && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Coach rate limit reached. Wait a few minutes and try again.
        </div>
      )}

      {state.status === "error" && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Coach unavailable — your note is saved.
        </div>
      )}

      {/* Sections */}
      {displayResult && !collapsed && activeSections.length > 0 && (
        <div className={cn("divide-y divide-primary/8", isRechecking && "opacity-50 pointer-events-none")}>
          {activeSections.map(({ key, label, Icon, colorClass, bgClass, recheckOnly }) => (
            <div
              key={key}
              className={cn(
                "px-3 py-2.5 flex items-start gap-2.5",
                bgClass,
                recheckOnly && isDone && state.isRecheck && "ring-1 ring-inset ring-current/10",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 flex-shrink-0 mt-0.5", colorClass)} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className={cn("text-[10px] font-bold uppercase tracking-wider", colorClass)}>
                  {label}
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {displayResult[key]}
                </p>
                {key === "suggestedRewrite" && onApplyRewrite && displayResult.suggestedRewrite && (
                  <button
                    onClick={() => {
                      onApplyRewrite(displayResult.suggestedRewrite!);
                      setApplied(true);
                      setTimeout(() => setApplied(false), 2000);
                    }}
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border transition-all",
                      applied
                        ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                        : "text-violet-600 dark:text-violet-400 border-violet-500/30 bg-violet-500/8 hover:bg-violet-500/15",
                    )}
                  >
                    {applied
                      ? <><Check className="h-2.5 w-2.5" />Copied to notes</>
                      : <><ClipboardPaste className="h-2.5 w-2.5" />Copy to my notes</>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer — Recheck Notes button */}
      {(isDone || isRechecking) && !collapsed && (
        <div className="px-3 py-2 border-t border-primary/10 flex items-center justify-between gap-2">
          <button
            onClick={handleRecheck}
            disabled={isRechecking || isLoading}
            className={cn(
              "inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all",
              unchanged
                ? "text-muted-foreground border-muted-foreground/20 bg-muted/30"
                : noteChanged
                  ? "text-primary border-primary/30 bg-primary/8 hover:bg-primary/15"
                  : "text-muted-foreground border-muted-foreground/20 hover:text-foreground hover:border-muted-foreground/40",
              (isRechecking || isLoading) && "opacity-50 cursor-not-allowed",
            )}
          >
            {isRechecking
              ? <><Loader2 className="h-2.5 w-2.5 animate-spin" />Rechecking…</>
              : unchanged
                ? <><Check className="h-2.5 w-2.5" />No changes</>
                : <><RefreshCw className="h-2.5 w-2.5" />Recheck Notes</>}
          </button>

          {noteChanged && !isRechecking && (
            <span className="text-[9px] text-primary/60 font-medium">Note edited since last check</span>
          )}
        </div>
      )}
    </div>
  );
}

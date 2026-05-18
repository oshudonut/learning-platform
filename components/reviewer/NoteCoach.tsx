"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Lightbulb,
  Loader2,
  PenLine,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteCoachResult } from "@/app/api/notes/coach/route";

// ── Module-level cache keyed by truncated note text (client-side) ──────────
const coachCache = new Map<string, NoteCoachResult>();

function cacheKey(noteText: string): string {
  return noteText.trim().slice(0, 60);
}

// ── Section metadata ───────────────────────────────────────────────────────

const SECTIONS: {
  key: keyof NoteCoachResult;
  label: string;
  Icon: React.FC<{ className?: string }>;
  colorClass: string;
  bgClass: string;
}[] = [
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

// ── Props ──────────────────────────────────────────────────────────────────

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
};

type CoachState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: NoteCoachResult }
  | { status: "limited" }
  | { status: "error" };

const MIN_CHARS = 20;
const DEBOUNCE_MS = 1500;

// ── Component ──────────────────────────────────────────────────────────────

export function NoteCoach({ noteText, topic, studyMode }: NoteCoachProps) {
  const [state, setState] = useState<CoachState>({ status: "idle" });
  const [collapsed, setCollapsed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const text = noteText.trim();

    if (text.length < MIN_CHARS) {
      setState({ status: "idle" });
      return;
    }

    // Serve from cache immediately
    const key = cacheKey(text);
    const cached = coachCache.get(key);
    if (cached) {
      setState({ status: "done", result: cached });
      return;
    }

    // Debounce before hitting the API
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!isMounted.current) return;

      // Cancel any in-flight request
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

        if (!res.ok) {
          setState({ status: "error" });
          return;
        }

        const data = await res.json() as { result: NoteCoachResult | null; limited?: boolean };

        if (!isMounted.current) return;

        if (data.limited) {
          setState({ status: "limited" });
          return;
        }

        if (!data.result) {
          setState({ status: "idle" });
          return;
        }

        coachCache.set(key, data.result);
        setState({ status: "done", result: data.result });
        setCollapsed(false); // auto-expand on new result
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (isMounted.current) setState({ status: "error" });
      }
    }, DEBOUNCE_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteText]);

  // Don't render anything until there's something to show
  if (state.status === "idle") return null;

  const activeSections = state.status === "done"
    ? SECTIONS.filter((s) => state.result[s.key])
    : [];

  if (state.status === "done" && activeSections.length === 0) return null;

  return (
    <div className={cn(
      "mt-3 rounded-xl border overflow-hidden transition-all",
      "bg-gradient-to-b from-primary/4 to-transparent border-primary/15",
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
        <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-[11px] font-semibold text-primary flex-1 uppercase tracking-wider">
          AI Study Coach
        </span>
        {state.status === "loading" && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
        )}
        {state.status === "done" && (
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

      {/* Body */}
      {state.status === "loading" && (
        <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
          <span>Analyzing your note…</span>
        </div>
      )}

      {state.status === "limited" && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Coach rate limit reached. Slow down or wait a few minutes.
        </div>
      )}

      {state.status === "error" && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Coach unavailable — your note is saved.
        </div>
      )}

      {state.status === "done" && !collapsed && (
        <div className="divide-y divide-primary/8">
          {activeSections.map(({ key, label, Icon, colorClass, bgClass }) => (
            <div key={key} className={cn("px-3 py-2.5 flex items-start gap-2.5", bgClass)}>
              <Icon className={cn("h-3.5 w-3.5 flex-shrink-0 mt-0.5", colorClass)} />
              <div className="min-w-0 space-y-0.5">
                <p className={cn("text-[10px] font-bold uppercase tracking-wider", colorClass)}>
                  {label}
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {state.result[key]}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

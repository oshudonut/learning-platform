"use client";

import { useRef, useState, useCallback } from "react";
import { Sparkles, X, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBoardText } from "@/components/reviewer/primitives/formatBoardText";

export type CompanionTrigger = "explicit_help" | "confusion";

export type CompanionTopicData = {
  title: string;
  coreIdea: string;
  keyPoints: string[];
  mustMemorize: string[];
  boardTips: string[];
};

type CompanionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "streaming"; text: string }
  | { status: "done"; text: string }
  | { status: "error"; message: string }
  | { status: "rate_limited" };

type CompanionPanelProps = {
  documentId: string;
  topicIndex: number;
  topic: CompanionTopicData;
  trigger?: CompanionTrigger;
  noteText?: string;
  confusionLevel?: number;
  onClose: () => void;
};

export function CompanionPanel({
  documentId,
  topicIndex,
  topic,
  trigger = "explicit_help",
  noteText,
  confusionLevel,
  onClose,
}: CompanionPanelProps) {
  const [state, setState] = useState<CompanionState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  // Auto-start streaming when mounted
  const startStream = useCallback(async (t: CompanionTrigger) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/companion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, topicIndex, triggerType: t, topic, noteText, confusionLevel }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        if (res.status === 429) {
          setState({ status: "rate_limited" });
        } else {
          setState({ status: "error", message: data.error ?? "AI companion unavailable." });
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setState({ status: "error", message: "Stream unavailable." }); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6)) as { ok?: boolean; text?: string; done?: boolean; error?: string };
            if (json.error) { setState({ status: "error", message: json.error }); return; }
            if (json.text) {
              accumulated += json.text;
              setState({ status: "streaming", text: accumulated });
            }
            if (json.done) {
              setState({ status: "done", text: accumulated });
              return;
            }
          } catch {
            // malformed line — skip
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setState({ status: "error", message: "AI companion unavailable. Please try again." });
    }
  }, [documentId, topicIndex, topic, noteText, confusionLevel]);

  // Kick off on first render
  if (!startedRef.current) {
    startedRef.current = true;
    void startStream(trigger);
  }

  const text = state.status === "streaming" || state.status === "done" ? state.text : "";

  return (
    <div className={cn(
      "mt-3 rounded-xl border bg-gradient-to-b from-primary/5 to-transparent",
      "border-primary/15 overflow-hidden",
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
        <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-primary flex-1">
          {trigger === "confusion" ? "AI Companion — Addressing your confusion" : "AI Companion"}
        </span>
        <div className="flex items-center gap-1">
          {(state.status === "done" || state.status === "error") && (
            <button
              onClick={() => void startStream(trigger)}
              className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Regenerate"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => { abortRef.current?.abort(); onClose(); }}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 text-sm leading-relaxed text-foreground/85 min-h-[48px]">
        {state.status === "loading" && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Thinking…</span>
          </span>
        )}

        {state.status === "error" && (
          <span className="flex items-center gap-2 text-destructive text-xs">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {state.message}
          </span>
        )}

        {state.status === "rate_limited" && (
          <span className="text-xs text-muted-foreground">
            Daily limit reached. The AI companion resets at midnight UTC.
          </span>
        )}

        {(state.status === "streaming" || state.status === "done") && text && (
          <StreamedMarkdown text={text} streaming={state.status === "streaming"} />
        )}
      </div>
    </div>
  );
}

// ── Lightweight markdown renderer for companion output ─────────────────────────

function StreamedMarkdown({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        // Bold: **text**
        const boldReplaced = line.replace(/\*\*(.+?)\*\*/g, "%%BOLD%%$1%%/BOLD%%");

        if (boldReplaced.startsWith("%%BOLD%%Key Takeaway:%%/BOLD%%") || line.startsWith("**Key Takeaway:**")) {
          const rest = line.replace(/^\*\*Key Takeaway:\*\*\s*/i, "").replace(/^\*\*Key Takeaway:\*\*/i, "");
          return (
            <p key={i} className="mt-2 pt-2 border-t border-primary/15 text-xs font-semibold text-primary/90">
              Key Takeaway: {rest}
            </p>
          );
        }

        if (!line.trim()) return null;

        // Render inline bold
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="text-sm leading-relaxed">
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={j}>{part.slice(2, -2)}</strong>
                : <span key={j}>{formatBoardText(part)}</span>
            )}
            {streaming && i === lines.length - 1 && (
              <span className="inline-block w-0.5 h-3.5 bg-primary/60 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        );
      })}
    </div>
  );
}

// ── Trigger button (used in BoardExamTopicRenderer) ───────────────────────────

export function CompanionTriggerButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider",
        "px-2.5 py-1 rounded-lg border transition-all",
        "text-primary/70 border-primary/20 hover:text-primary hover:border-primary/40 hover:bg-primary/5",
        "disabled:opacity-40 disabled:cursor-not-allowed",
      )}
    >
      <Sparkles className="h-3 w-3" />
      Get AI Help
    </button>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Send, Bot, Sparkles, RotateCcw, Trash2, Loader2,
  TrendingUp, TrendingDown, Minus, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlannerAI } from "@/hooks/usePlannerAI";
import type { PlannerAnalysis } from "@/hooks/usePlannerAI";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string; error?: boolean };

// ─── Quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Am I behind?",         prompt: "Am I currently behind on my study schedule? Give me a direct assessment." },
  { label: "Study tonight?",       prompt: "What should I study tonight to be most effective given my current plan state?" },
  { label: "Weakest topics?",      prompt: "What are my weakest topics right now based on my quiz scores and confusion levels?" },
  { label: "Can I finish in time?", prompt: "Can I realistically complete my study plan before the exam? What's my readiness?" },
  { label: "What to review?",      prompt: "Which topics should I review tonight to strengthen retention before the exam?" },
  { label: "Highest yield?",       prompt: "Which topics are highest yield for my exam based on my current performance data?" },
];

// ─── Badge config ─────────────────────────────────────────────────────────────

const READINESS_STYLE: Record<string, string> = {
  "Critical":   "text-red-500 bg-red-500/10 border-red-500/20",
  "Weak":       "text-orange-500 bg-orange-500/10 border-orange-500/20",
  "Developing": "text-amber-500 bg-amber-500/10 border-amber-500/20",
  "Strong":     "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  "Exam Ready": "text-primary bg-primary/10 border-primary/20",
};

const BURNOUT_STYLE: Record<string, string> = {
  low:      "text-emerald-600 bg-emerald-500/10",
  moderate: "text-amber-600 bg-amber-500/10",
  high:     "text-red-600 bg-red-500/10",
};

const PACE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  behind:   { icon: TrendingDown, color: "text-red-500",     label: "Behind" },
  on_track: { icon: Minus,        color: "text-primary",     label: "On Track" },
  ahead:    { icon: TrendingUp,   color: "text-emerald-500", label: "Ahead" },
};

// ─── Inline markdown renderer ─────────────────────────────────────────────────

function renderInline(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**"))
      return <strong key={i} className="font-semibold text-foreground">{seg.slice(2, -2)}</strong>;
    if (seg.startsWith("*") && seg.endsWith("*") && seg.length > 2)
      return <em key={i} className="italic">{seg.slice(1, -1)}</em>;
    if (seg.startsWith("`") && seg.endsWith("`"))
      return <code key={i} className="font-mono text-[10px] bg-muted/60 px-1 py-0.5 rounded">{seg.slice(1, -1)}</code>;
    return <span key={i}>{seg}</span>;
  });
}

function MarkdownBody({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bullet list group
    if (/^[-*•] /.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length && /^[-*•] /.test(lines[i])) {
        bullets.push(lines[i].replace(/^[-*•] /, ""));
        i++;
      }
      nodes.push(
        <ul key={nodes.length} className="mt-1.5 space-y-0.5">
          {bullets.map((b, j) => (
            <li key={j} className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground/60" />
              <span className="leading-snug">{renderInline(b)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list group
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      let n = 1;
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
        n++;
      }
      void n;
      nodes.push(
        <ol key={nodes.length} className="mt-1.5 space-y-0.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5">
              <span className="flex-shrink-0 text-[10px] font-semibold text-muted-foreground mt-0.5 w-4">{j + 1}.</span>
              <span className="leading-snug">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Skip blank
    if (!line.trim()) { i++; continue; }

    // Paragraph
    nodes.push(
      <p key={nodes.length} className={nodes.length > 0 ? "mt-1.5 leading-snug" : "leading-snug"}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <>{nodes}</>;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function Bubble({ msg, onRetry }: { msg: ChatMessage; onRetry?: () => void }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex gap-2", isUser && "flex-row-reverse")}
    >
      <div className={cn(
        "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ring-1 mt-0.5",
        isUser ? "bg-primary/10 ring-primary/20" : "bg-foreground/8 ring-foreground/12",
      )}>
        {isUser
          ? <span className="text-[10px] font-bold text-primary">U</span>
          : <Bot className="h-3 w-3 text-foreground/70" />
        }
      </div>

      <div className={cn(
        "max-w-[82%] rounded-2xl px-3 py-2 text-xs",
        isUser
          ? "rounded-tr-sm bg-primary/12 text-foreground"
          : msg.error
            ? "rounded-tl-sm bg-red-500/8 border border-red-500/20 text-foreground"
            : "rounded-tl-sm bg-muted/60 border border-border/50 text-foreground",
      )}>
        <MarkdownBody text={msg.content} />
        {msg.error && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-red-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw className="h-2.5 w-2.5" /> Retry
          </button>
        )}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground/8 ring-1 ring-foreground/12 mt-0.5">
        <Bot className="h-3 w-3 text-foreground/70" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted/60 border border-border/50 px-3 py-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────

function StatusBadges({ analysis }: { analysis: PlannerAnalysis | null }) {
  if (!analysis) return null;
  const PaceIcon = PACE_META[analysis.paceStatus]?.icon ?? Minus;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
      <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold", READINESS_STYLE[analysis.readinessLabel])}>
        {analysis.readinessScore} · {analysis.readinessLabel}
      </span>
      <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium", BURNOUT_STYLE[analysis.burnoutRisk])}>
        Burnout: {analysis.burnoutRisk}
      </span>
      <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium", PACE_META[analysis.paceStatus]?.color, "bg-foreground/5")}>
        <PaceIcon className="h-2.5 w-2.5" />
        {PACE_META[analysis.paceStatus]?.label}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  planId: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

export function PlannerAIChat({ planId, triggerLabel = "AI Advisor", triggerClassName }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // lazy mount
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { analysis, analyzeLoading, analyze } = usePlannerAI(planId);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText]);

  function openPanel() {
    setIsOpen(true);
    if (!mounted) {
      setMounted(true);
      void analyze(); // trigger once on first open
    }
    setTimeout(() => inputRef.current?.focus(), 150);
  }

  const { chat } = usePlannerAI(planId);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setLastUserMessage(trimmed);
    setChatError(null);
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setStreaming(true);
    setStreamedText("");

    let accumulated = "";

    await chat(
      nextMessages,
      (chunk) => {
        accumulated += chunk;
        setStreamedText(accumulated);
      },
      () => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: accumulated },
        ]);
        setStreamedText("");
        setStreaming(false);
      },
      (errMsg) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `I ran into an issue: ${errMsg}`, error: true },
        ]);
        setChatError(errMsg);
        setStreamedText("");
        setStreaming(false);
      },
    );
  }, [messages, streaming, chat]);

  function handleRetry() {
    if (!lastUserMessage) return;
    // Remove last assistant error message, re-send
    setMessages((prev) => prev.slice(0, -1));
    void sendMessage(lastUserMessage);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function clearConversation() {
    setMessages([]);
    setStreamedText("");
    setChatError(null);
    setLastUserMessage("");
  }

  const showQuickActions = messages.length === 0 && !streaming;

  // Panel motion variants
  const panelVariants = {
    hidden: {
      x: "100%",
      transition: { type: "tween" as const, duration: 0.25 },
    },
    visible: {
      x: 0,
      transition: { type: "tween" as const, duration: 0.22 },
    },
  };
  const drawerVariants = {
    hidden: {
      y: "100%",
      transition: { type: "tween" as const, duration: 0.25 },
    },
    visible: {
      y: 0,
      transition: { type: "tween" as const, duration: 0.22 },
    },
  };

  return (
    <>
      {/* ── Trigger ── */}
      <button
        onClick={openPanel}
        className={triggerClassName ?? cn(
          "flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/8",
          "px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors",
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {triggerLabel}
      </button>

      {/* ── Portal: backdrop + panel ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
            />

            {/* Desktop panel — slides in from right */}
            <motion.div
              key="panel-desktop"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={panelVariants}
              className={cn(
                "fixed right-0 top-0 z-50 hidden md:flex flex-col",
                "h-screen w-[340px] border-l border-border bg-card shadow-2xl",
              )}
            >
              <ChatPanel
                analysis={analysis}
                analyzeLoading={analyzeLoading}
                messages={messages}
                streamedText={streamedText}
                streaming={streaming}
                showQuickActions={showQuickActions}
                input={input}
                setInput={setInput}
                sendMessage={sendMessage}
                handleRetry={handleRetry}
                handleKeyDown={handleKeyDown}
                clearConversation={clearConversation}
                onClose={() => setIsOpen(false)}
                bottomRef={bottomRef}
                inputRef={inputRef}
              />
            </motion.div>

            {/* Mobile drawer — slides up from bottom */}
            <motion.div
              key="panel-mobile"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={drawerVariants}
              className={cn(
                "fixed bottom-0 left-0 right-0 z-50 flex md:hidden flex-col",
                "h-[78vh] rounded-t-2xl border-t border-border bg-card shadow-2xl",
              )}
            >
              {/* Mobile drag handle */}
              <div className="flex justify-center pt-2.5 pb-0">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
              </div>
              <ChatPanel
                analysis={analysis}
                analyzeLoading={analyzeLoading}
                messages={messages}
                streamedText={streamedText}
                streaming={streaming}
                showQuickActions={showQuickActions}
                input={input}
                setInput={setInput}
                sendMessage={sendMessage}
                handleRetry={handleRetry}
                handleKeyDown={handleKeyDown}
                clearConversation={clearConversation}
                onClose={() => setIsOpen(false)}
                bottomRef={bottomRef}
                inputRef={inputRef}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Chat panel (shared between desktop + mobile) ─────────────────────────────

type PanelProps = {
  analysis: PlannerAnalysis | null;
  analyzeLoading: boolean;
  messages: ChatMessage[];
  streamedText: string;
  streaming: boolean;
  showQuickActions: boolean;
  input: string;
  setInput: (v: string) => void;
  sendMessage: (text: string) => void;
  handleRetry: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  clearConversation: () => void;
  onClose: () => void;
  bottomRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
};

function ChatPanel({
  analysis, analyzeLoading, messages, streamedText, streaming,
  showQuickActions, input, setInput, sendMessage, handleRetry,
  handleKeyDown, clearConversation, onClose, bottomRef, inputRef,
}: PanelProps) {
  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-4 pt-3 pb-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground leading-none">AI Study Advisor</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">Board exam mentor</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                title="Clear conversation"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Badges */}
        {analyzeLoading ? (
          <div className="flex items-center gap-1.5 px-0 pb-2">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Analyzing plan…</span>
          </div>
        ) : (
          <StatusBadges analysis={analysis} />
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Empty state + quick actions */}
        {showQuickActions && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground/8 ring-1 ring-foreground/12 mt-0.5">
                <Bot className="h-3 w-3 text-foreground/70" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted/60 border border-border/50 px-3 py-2 text-xs text-foreground">
                {analysis ? (
                  <MarkdownBody text={analysis.briefing} />
                ) : analyzeLoading ? (
                  <span className="text-muted-foreground">Loading your plan data…</span>
                ) : (
                  <span>Hi! I&apos;m your AI study advisor. Ask me anything about your plan, exam readiness, or what to focus on next.</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5 pl-8">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick questions</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map(({ label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => sendMessage(prompt)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversation */}
        {messages.map((msg, i) => (
          <Bubble
            key={i}
            msg={msg}
            onRetry={msg.error ? handleRetry : undefined}
          />
        ))}

        {/* Streaming text */}
        {streamedText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2"
          >
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground/8 ring-1 ring-foreground/12 mt-0.5">
              <Bot className="h-3 w-3 text-foreground/70" />
            </div>
            <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-muted/60 border border-border/50 px-3 py-2 text-xs text-foreground">
              <MarkdownBody text={streamedText} />
              <span className="inline-block h-3 w-0.5 bg-primary ml-0.5 animate-pulse" />
            </div>
          </motion.div>
        )}

        {/* Typing indicator */}
        {streaming && !streamedText && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:border-primary/40 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask your AI advisor…"
            disabled={streaming}
            className="flex-1 resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 max-h-20 overflow-y-auto leading-relaxed"
            style={{ height: "20px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {streaming
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Send className="h-3 w-3" />
            }
          </button>
        </div>
        <p className="mt-1.5 text-center text-[9px] text-muted-foreground/50">
          Haiku-powered · responses grounded in your plan data
        </p>
      </div>
    </>
  );
}

// ─── Floating action button variant (for dashboard) ───────────────────────────

export function PlannerAIChatFAB({ planId }: { planId: string }) {
  const [visible, setVisible] = useState(false);

  // Delay render so it doesn't flash on page load
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="fixed bottom-6 right-6 z-30"
      >
        <PlannerAIChat
          planId={planId}
          triggerLabel=""
          triggerClassName={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity",
          )}
        />
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Collapsible drawer variant (mobile quick-access) ─────────────────────────

export function PlannerAIChatDrawer({ planId }: { planId: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30">
      {/* Tab */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-card border-t border-border text-xs font-semibold text-foreground"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        AI Advisor
        <ChevronUp className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "65vh" }}
            exit={{ height: 0 }}
            className="overflow-hidden bg-card border-t border-border"
          >
            <PlannerAIChat planId={planId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2, X, Loader2, Check, AlertTriangle, ArrowRightLeft,
  Plus, Clock, ArrowUpDown, Minus, ChevronRight, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlannerAI } from "@/hooks/usePlannerAI";
import type { OptimizationPlan } from "@/hooks/usePlannerAI";

// ─── Change type meta ─────────────────────────────────────────────────────────

type ChangeType = "move" | "add_review" | "defer" | "reprioritize" | "remove";

const CHANGE_META: Record<ChangeType, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  move:         { icon: ArrowRightLeft, color: "text-sky-500",    bg: "bg-sky-500/10",    label: "Move" },
  add_review:   { icon: Plus,           color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Add Review" },
  defer:        { icon: Clock,          color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Defer" },
  reprioritize: { icon: ArrowUpDown,    color: "text-violet-500",  bg: "bg-violet-500/10",  label: "Reprioritize" },
  remove:       { icon: Minus,          color: "text-red-500",     bg: "bg-red-500/10",     label: "Remove" },
};

// ─── Change card ──────────────────────────────────────────────────────────────

function ChangeCard({ change }: { change: OptimizationPlan["changes"][number] }) {
  const meta = CHANGE_META[change.type] ?? CHANGE_META.move;
  const Icon = meta.icon;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border p-3">
      <div className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg mt-0.5", meta.bg)}>
        <Icon className={cn("h-3.5 w-3.5", meta.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn("text-[10px] font-bold uppercase tracking-wider", meta.color)}>{meta.label}</span>
          <span className="text-xs font-semibold text-foreground truncate">{change.documentTitle}</span>
        </div>
        <p className="text-xs text-foreground leading-snug">{change.description}</p>
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
          <span className="font-semibold">Why:</span> {change.reason}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Phase = "idle" | "generating" | "review" | "applying" | "done" | "error";

type Props = {
  planId: string;
  onApplied?: () => void;
};

export function PlannerOptimizer({ planId, onApplied }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<OptimizationPlan | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);

  const { optimize, optimizeLoading, invalidate } = usePlannerAI(planId);

  async function handleGenerate() {
    setPhase("generating");
    setErrorMsg(null);
    setPlan(null);

    try {
      // Calling optimize() updates the hook's state — but we also capture via
      // the same hook instance; simplest: use the returned value indirectly
      const res = await fetch("/api/planner/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "optimize", planId }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { optimization: OptimizationPlan };
      setPlan(data.optimization);
      setPhase("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Optimization failed");
      setPhase("error");
    }
  }

  async function handleApply() {
    if (!plan) return;
    setPhase("applying");

    let applied = 0;

    try {
      // 1. Apply priority adjustments
      if (plan.priorityAdjustments.length > 0) {
        await Promise.allSettled(
          plan.priorityAdjustments.map((adj) =>
            fetch(`/api/planner/${planId}/documents`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ documentId: adj.documentId, priority: adj.newPriority }),
            })
          )
        );
        applied += plan.priorityAdjustments.length;
      }

      // 2. Full reschedule (redistributes all pending items with new priorities)
      const rescheduleRes = await fetch(`/api/planner/${planId}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const rescheduleData = await rescheduleRes.json() as { rescheduledCount?: number };
      applied += rescheduleData.rescheduledCount ?? 0;

      // 3. Invalidate AI cache so next analysis reflects changes
      invalidate();

      setAppliedCount(applied);
      setPhase("done");
      onApplied?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Apply failed");
      setPhase("error");
    }
  }

  function dismiss() {
    setPhase("idle");
    setPlan(null);
    setErrorMsg(null);
    setAppliedCount(0);
  }

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        onClick={() => void handleGenerate()}
        disabled={phase === "generating" || phase === "applying"}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
          "border border-violet-500/20 bg-violet-500/8 text-violet-600",
          "hover:bg-violet-500/15 disabled:opacity-50",
        )}
      >
        {phase === "generating" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Wand2 className="h-3.5 w-3.5" />
        )}
        {phase === "generating" ? "Analyzing…" : "Optimize Plan"}
      </button>

      {/* ── Modal overlay ── */}
      <AnimatePresence>
        {phase !== "idle" && (
          <motion.div
            key="optimizer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-[2px]"
            onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "tween", duration: 0.22 }}
              className={cn(
                "w-full sm:max-w-lg bg-card border-t sm:border border-border",
                "sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col",
                "max-h-[90vh] sm:max-h-[82vh]",
              )}
            >
              {/* ── Generating ── */}
              {phase === "generating" && (
                <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
                  <div className="relative">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10">
                      <Wand2 className="h-6 w-6 text-violet-500" />
                    </div>
                    <Loader2 className="absolute -right-1 -bottom-1 h-5 w-5 animate-spin text-violet-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Analyzing your plan…</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reviewing overdue tasks, quiz scores, and workload distribution
                    </p>
                  </div>
                </div>
              )}

              {/* ── Review ── */}
              {phase === "review" && plan && (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10">
                        <Wand2 className="h-4 w-4 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Optimization Plan</p>
                        <p className="text-[10px] text-muted-foreground">
                          {plan.changes.length} change{plan.changes.length !== 1 ? "s" : ""} proposed
                          {plan.priorityAdjustments.length > 0 && ` · ${plan.priorityAdjustments.length} priority adjustment${plan.priorityAdjustments.length !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </div>
                    <button onClick={dismiss} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Scrollable content */}
                  <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-4">
                    {/* AI summary */}
                    <div className="rounded-xl bg-violet-500/6 border border-violet-500/15 px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="h-3 w-3 text-violet-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500">AI Summary</span>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed">{plan.summary}</p>
                    </div>

                    {/* Warnings */}
                    {plan.warningsIssued.length > 0 && (
                      <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-4 py-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Warnings</span>
                        </div>
                        <ul className="space-y-1">
                          {plan.warningsIssued.map((w, i) => (
                            <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                              <ChevronRight className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Change list */}
                    {plan.changes.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proposed Changes</p>
                        {plan.changes.map((change, i) => (
                          <ChangeCard key={i} change={change} />
                        ))}
                      </div>
                    )}

                    {/* Priority adjustments */}
                    {plan.priorityAdjustments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Priority Adjustments</p>
                        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                          {plan.priorityAdjustments.map((adj, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{adj.documentId}</p>
                                <p className="text-[10px] text-muted-foreground">{adj.reason}</p>
                              </div>
                              <span className="flex-shrink-0 ml-3 text-xs font-bold text-violet-500">
                                Priority {adj.newPriority}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {plan.changes.length === 0 && plan.priorityAdjustments.length === 0 && (
                      <div className="text-center py-6">
                        <p className="text-sm font-semibold text-foreground">Your plan looks good!</p>
                        <p className="text-xs text-muted-foreground mt-1">No structural changes recommended.</p>
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  <div className="flex-shrink-0 border-t border-border px-5 py-4 flex items-center gap-3">
                    <button
                      onClick={dismiss}
                      className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => void handleApply()}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 transition-colors"
                    >
                      <Wand2 className="h-4 w-4" />
                      Apply Changes
                    </button>
                  </div>
                </>
              )}

              {/* ── Applying ── */}
              {phase === "applying" && (
                <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
                  <div className="relative">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10">
                      <Wand2 className="h-6 w-6 text-violet-500" />
                    </div>
                    <Loader2 className="absolute -right-1 -bottom-1 h-5 w-5 animate-spin text-violet-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Applying changes…</p>
                    <p className="text-xs text-muted-foreground mt-1">Rescheduling your tasks</p>
                  </div>
                </div>
              )}

              {/* ── Done ── */}
              {phase === "done" && (
                <>
                  <div className="flex flex-col items-center justify-center gap-4 py-14 px-6">
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", bounce: 0.4 }}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10"
                    >
                      <Check className="h-7 w-7 text-emerald-500" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Plan optimized!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {appliedCount > 0
                          ? `${appliedCount} item${appliedCount !== 1 ? "s" : ""} rescheduled based on AI recommendations.`
                          : "Your schedule has been reorganized."}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 border-t border-border px-5 py-4">
                    <button
                      onClick={dismiss}
                      className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {/* ── Error ── */}
              {phase === "error" && (
                <>
                  <div className="flex flex-col items-center justify-center gap-4 py-14 px-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
                      <AlertTriangle className="h-7 w-7 text-red-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Optimization failed</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{errorMsg}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 border-t border-border px-5 py-4 flex gap-3">
                    <button onClick={dismiss} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      Dismiss
                    </button>
                    <button
                      onClick={() => void handleGenerate()}
                      className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      Try Again
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

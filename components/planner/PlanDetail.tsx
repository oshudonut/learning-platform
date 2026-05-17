"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  RefreshCw,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DailyChecklist } from "./DailyChecklist";
import { CalendarView } from "./CalendarView";
import { PlannerAIChat } from "./PlannerAIChat";
import { PlannerOptimizer } from "./PlannerOptimizer";
import { ITEM_TYPE_META } from "./itemTypeMeta";
import type { StudyPlan, StudyPlanItem, StudyPlanDocument } from "@/lib/types";
import type { DailyBrief } from "@/lib/planner";

type PlanDetailData = {
  plan: StudyPlan;
  planDocuments: StudyPlanDocument[];
  items: StudyPlanItem[];
};

type TodayData = {
  brief: DailyBrief;
};

const TAB_OPTIONS = ["Today", "Calendar", "Progress"] as const;
type Tab = typeof TAB_OPTIONS[number];

export function PlanDetail({ planId }: { planId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PlanDetailData | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Today");
  const [menuOpen, setMenuOpen] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [planRes, todayRes] = await Promise.all([
        fetch(`/api/planner/${planId}`),
        fetch("/api/planner/today"),
      ]);
      const planData = await planRes.json() as PlanDetailData & { error?: string };
      const todayData = await todayRes.json() as TodayData & { error?: string };
      if (planRes.ok) setData(planData);
      if (todayRes.ok) setToday(todayData);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  async function handleStatusChange(status: StudyPlan["status"]) {
    if (!data) return;
    setActioning(status);
    try {
      const res = await fetch(`/api/planner/${planId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const { plan } = await res.json() as { plan: StudyPlan };
        setData((prev) => prev ? { ...prev, plan } : prev);
      }
    } finally {
      setActioning(null);
      setMenuOpen(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this plan? This cannot be undone.")) return;
    setActioning("delete");
    try {
      await fetch(`/api/planner/${planId}`, { method: "DELETE" });
      router.push("/planner");
    } finally {
      setActioning(null);
    }
  }

  async function handleReschedule() {
    setRescheduling(true);
    try {
      await fetch(`/api/planner/${planId}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      await fetchAll();
    } finally {
      setRescheduling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Plan not found.</p>
        <button onClick={() => router.push("/planner")} className="mt-4 text-sm text-primary hover:underline">
          Back to planner
        </button>
      </div>
    );
  }

  const { plan, items } = data;
  const brief = today?.brief;

  const examDate = new Date(plan.examDate).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const daysLeft = Math.ceil((plan.examDate - Date.now()) / 86400000);

  // Progress stats from items
  const completedItems = items.filter((i) => i.completedAt).length;
  const totalItems = items.length;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const itemsByType = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.itemType] = (acc[item.itemType] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Back + header */}
      <div className="flex items-start gap-3 mb-6">
        <button
          onClick={() => router.push("/planner")}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground truncate">{plan.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {examDate}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {plan.dailyHours}h/day
                </span>
                {daysLeft > 0 ? (
                  <span className={cn("font-semibold", daysLeft <= 7 ? "text-red-500" : "text-foreground")}>
                    {daysLeft} days left
                  </span>
                ) : (
                  <span className="text-muted-foreground">Past exam date</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <PlannerAIChat planId={planId} />

              {/* More options */}
              <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 min-w-[160px] rounded-xl border border-border bg-card shadow-xl py-1">
                  {plan.status === "active" ? (
                    <button
                      onClick={() => void handleStatusChange("paused")}
                      disabled={actioning !== null}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/50"
                    >
                      <Pause className="h-3.5 w-3.5 text-amber-500" />
                      Pause plan
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleStatusChange("active")}
                      disabled={actioning !== null}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/50"
                    >
                      <Play className="h-3.5 w-3.5 text-emerald-500" />
                      Resume plan
                    </button>
                  )}
                  <button
                    onClick={() => void handleStatusChange("completed")}
                    disabled={actioning !== null}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Mark completed
                  </button>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => void handleDelete()}
                    disabled={actioning !== null}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete plan
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 mb-6">
        {TAB_OPTIONS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
              tab === t
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Today" && brief && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{brief.summary.estimatedMins}m</span> estimated today
              {brief.summary.overdueCount > 0 && (
                <span className="text-red-500 ml-2 font-semibold">
                  · {brief.summary.overdueCount} overdue
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PlannerOptimizer planId={planId} onApplied={() => void fetchAll()} />
              <button
                onClick={() => void handleReschedule()}
                disabled={rescheduling}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {rescheduling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Reschedule
              </button>
            </div>
          </div>
          <DailyChecklist
            brief={brief}
            planId={planId}
            onItemActioned={() => void fetchAll()}
          />
        </motion.div>
      )}

      {tab === "Calendar" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <CalendarView items={items} examDate={plan.examDate} weeks={6} />
        </motion.div>
      )}

      {tab === "Progress" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Overall progress */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Completion (next 30 days)
            </p>
            <div className="flex items-end gap-3 mb-2">
              <span className="text-3xl font-bold text-foreground">{progressPct}%</span>
              <span className="text-sm text-muted-foreground mb-1">
                {completedItems} / {totalItems} tasks
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full bg-primary"
              />
            </div>
          </div>

          {/* Item type breakdown */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Tasks by Type
            </p>
            <div className="space-y-2.5">
              {(Object.entries(itemsByType) as [StudyPlanItem["itemType"], number][]).map(([type, count]) => {
                const meta = ITEM_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", meta.bg)}>
                      <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                    </div>
                    <span className="text-sm text-foreground flex-1">{meta.label}</span>
                    <span className="text-sm font-semibold text-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily hours */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Study Budget
            </p>
            <p className="text-2xl font-bold text-foreground">{plan.dailyHours}h</p>
            <p className="text-xs text-muted-foreground mt-0.5">per day</p>
          </div>
        </motion.div>
      )}

      {/* Overlay click-away for menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
      )}
    </div>
  );
}

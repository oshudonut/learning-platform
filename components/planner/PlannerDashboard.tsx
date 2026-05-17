"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  Plus,
  Loader2,
  Clock,
  CheckCircle,
  PauseCircle,
  Archive,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreatePlanForm } from "./CreatePlanForm";
import { PlannerAIChatFAB } from "./PlannerAIChat";
import type { StudyPlan } from "@/lib/types";

const STATUS_META: Record<StudyPlan["status"], { label: string; icon: React.ElementType; color: string }> = {
  active:    { label: "Active",    icon: Clock,         color: "text-emerald-500" },
  paused:    { label: "Paused",    icon: PauseCircle,   color: "text-amber-500"  },
  completed: { label: "Completed", icon: CheckCircle,   color: "text-primary"    },
  archived:  { label: "Archived",  icon: Archive,       color: "text-muted-foreground" },
};

function PlanCard({ plan }: { plan: StudyPlan }) {
  const router = useRouter();
  const meta = STATUS_META[plan.status];
  const Icon = meta.icon;
  const daysLeft = Math.ceil((plan.examDate - Date.now()) / 86400000);
  const examDate = new Date(plan.examDate).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onClick={() => router.push(`/planner/${plan.id}`)}
      className="w-full text-left rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all p-5 group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <CalendarDays className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{plan.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Icon className={cn("h-3 w-3", meta.color)} />
              <span className={cn("text-[10px] font-medium", meta.color)}>{meta.label}</span>
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1 group-hover:text-foreground transition-colors" />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          <span>{examDate}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{plan.dailyHours}h/day</span>
        </div>
        {daysLeft > 0 ? (
          <span className={cn("ml-auto font-semibold", daysLeft <= 7 ? "text-red-500" : "text-foreground")}>
            {daysLeft}d left
          </span>
        ) : (
          <span className="ml-auto font-semibold text-muted-foreground">Past exam date</span>
        )}
      </div>
    </motion.button>
  );
}

export function PlannerDashboard() {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetch("/api/planner")
      .then((r) => r.json())
      .then((data) => setPlans((data.plans ?? []) as StudyPlan[]))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const active = plans.filter((p) => p.status === "active");
  const inactive = plans.filter((p) => p.status !== "active");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Study Planner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Adaptive schedules built around your exam date
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
            showCreate
              ? "bg-muted text-muted-foreground hover:text-foreground"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          <Plus className="h-4 w-4" />
          New Plan
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Create New Plan</h2>
              <CreatePlanForm onCancel={() => setShowCreate(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active plans */}
      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active Plans
          </h2>
          {active.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </section>
      )}

      {/* Inactive plans */}
      {inactive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Other Plans
          </h2>
          {inactive.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </section>
      )}

      {/* Empty state */}
      {plans.length === 0 && !showCreate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center text-center py-24 gap-5"
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">No study plans yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Create a plan with your exam date and documents. The scheduler builds your
              daily tasks automatically.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Create your first plan
          </button>
        </motion.div>
      )}

      {/* AI FAB — shown for first active plan */}
      {active.length > 0 && <PlannerAIChatFAB planId={active[0].id} />}
    </div>
  );
}

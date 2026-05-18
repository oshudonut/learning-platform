"use client";

import { useEffect, useState } from "react";
import { DailyBriefingWidget } from "./DailyBriefingWidget";
import type { StudyPlan } from "@/lib/types";

export function HomeBriefingLoader() {
  const [plan, setPlan] = useState<StudyPlan | null | "loading">("loading");

  useEffect(() => {
    fetch("/api/planner")
      .then((r) => r.json())
      .then((data: { plans?: StudyPlan[] }) => {
        const active = (data.plans ?? []).find((p) => p.status === "active");
        setPlan(active ?? null);
      })
      .catch(() => setPlan(null));
  }, []);

  if (plan === "loading" || plan === null) return null;

  return (
    <div className="mb-8">
      <DailyBriefingWidget planId={plan.id} planTitle={plan.title} />
    </div>
  );
}

"use client";

import { useState, useCallback, useRef } from "react";
import type { ExamReadiness } from "@/app/api/planner/[id]/readiness/route";

export type { ExamReadiness };
export type { TopicReadiness, ReadinessLabel } from "@/app/api/planner/[id]/readiness/route";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: ExamReadiness; at: number }>();

export function useReadiness(planId: string | null) {
  const [readiness, setReadiness] = useState<ExamReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchAt = useRef<number>(0);

  const fetch_ = useCallback(async (force = false) => {
    if (!planId) return;

    if (!force) {
      const cached = cache.get(planId);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setReadiness(cached.data);
        return;
      }
      // Debounce: ignore duplicate calls within 2s
      if (Date.now() - lastFetchAt.current < 2000) return;
    }

    lastFetchAt.current = Date.now();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/planner/${planId}/readiness`);
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const d = await res.json() as { readiness: ExamReadiness };
      cache.set(planId, { data: d.readiness, at: Date.now() });
      setReadiness(d.readiness);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load readiness");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  const invalidate = useCallback(() => {
    if (planId) cache.delete(planId);
    setReadiness(null);
  }, [planId]);

  return { readiness, loading, error, fetch: fetch_, invalidate };
}

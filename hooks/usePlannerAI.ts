"use client";

import { useState, useCallback, useRef } from "react";
import type { PlannerAnalysis } from "@/lib/plannerAI";
import type { OptimizationPlan } from "@/lib/plannerAI";

export type { PlannerAnalysis, OptimizationPlan };

type ChatMessage = { role: "user" | "assistant"; content: string };

type AnalysisCache = {
  analysis: PlannerAnalysis;
  cachedAt: number;
};

// 5-minute TTL — warm enough for a study session without stale data
const CACHE_TTL_MS = 5 * 60 * 1000;
// Debounce: ignore duplicate analyze() calls within 3 seconds
const DEBOUNCE_MS = 3000;

// Module-level cache shared across hook instances for the same planId
const analysisCache = new Map<string, AnalysisCache>();

export function usePlannerAI(planId: string | null) {
  const [analysis, setAnalysis] = useState<PlannerAnalysis | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [optimization, setOptimization] = useState<OptimizationPlan | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  const lastAnalyzedAt = useRef<number>(0);

  // ── analyze ────────────────────────────────────────────────────────────────

  const analyze = useCallback(async (force = false) => {
    if (!planId) return;

    // Debounce guard
    if (!force && Date.now() - lastAnalyzedAt.current < DEBOUNCE_MS) return;

    // Cache hit
    if (!force) {
      const cached = analysisCache.get(planId);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        setAnalysis(cached.analysis);
        return;
      }
    }

    lastAnalyzedAt.current = Date.now();
    setAnalyzeLoading(true);
    setAnalyzeError(null);

    try {
      const res = await fetch("/api/planner/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "analyze", planId }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { analysis: PlannerAnalysis };
      analysisCache.set(planId, { analysis: data.analysis, cachedAt: Date.now() });
      setAnalysis(data.analysis);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzeLoading(false);
    }
  }, [planId]);

  // ── optimize ───────────────────────────────────────────────────────────────

  const optimize = useCallback(async () => {
    if (!planId) return;
    setOptimizeLoading(true);
    setOptimizeError(null);

    try {
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
      setOptimization(data.optimization);
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setOptimizeLoading(false);
    }
  }, [planId]);

  // ── chat (streaming) ───────────────────────────────────────────────────────

  const chat = useCallback(async (
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (msg: string) => void,
  ) => {
    if (!planId) return;

    try {
      const res = await fetch("/api/planner/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "chat", planId, messages }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        onError(data.error ?? `HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line || line === "[DONE]") { onDone(); continue; }
          try {
            const parsed = JSON.parse(line) as { text?: string; error?: string };
            if (parsed.error) { onError(parsed.error); return; }
            if (parsed.text) onChunk(parsed.text);
          } catch { /* skip malformed chunk */ }
        }
      }

      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Chat failed");
    }
  }, [planId]);

  // ── briefing (quick extract from analyze) ─────────────────────────────────

  const getBriefing = useCallback(async (): Promise<string | null> => {
    if (!planId) return null;

    // Reuse cached analysis if available
    const cached = analysisCache.get(planId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.analysis.briefing;
    }

    try {
      const res = await fetch("/api/planner/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "briefing", planId }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { briefing?: string };
      return data.briefing ?? null;
    } catch {
      return null;
    }
  }, [planId]);

  // ── invalidate ─────────────────────────────────────────────────────────────

  const invalidate = useCallback(() => {
    if (planId) analysisCache.delete(planId);
    setAnalysis(null);
    setOptimization(null);
  }, [planId]);

  return {
    // analysis
    analysis,
    analyzeLoading,
    analyzeError,
    analyze,
    // optimization
    optimization,
    optimizeLoading,
    optimizeError,
    optimize,
    // chat (streaming)
    chat,
    // briefing
    getBriefing,
    // cache
    invalidate,
  };
}

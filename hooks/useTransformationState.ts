"use client";

import { useCallback, useMemo, useState } from "react";
import type { StudyTransformation, AnyReviewer } from "@/lib/types";
import { fireEvent, ANALYTICS_EVENTS } from "@/lib/analytics-events";

export type TransformationViewState =
  | "idle"       // no transformation loaded, show picker
  | "loading"    // generation or fetch in progress
  | "success"    // transformation loaded and ready
  | "error"      // generation or load failed
  | "stale";     // loaded but transcript version mismatch

export interface TransformationStateResult {
  // Active transformation record (includes metadata)
  active: StudyTransformation | null;
  // Extracted reviewer content for ReviewerView (null for rapid_recall)
  reviewerContent: AnyReviewer | null;
  // Flattened view state (drives which component renders in the review tab)
  viewState: TransformationViewState;
  error: string | null;
  // Ordered history (all non-superseded transformations for this document)
  history: StudyTransformation[];
  historyLoaded: boolean;
  isStale: boolean;

  // Mutations
  activate: (t: StudyTransformation) => void;
  setViewState: (s: TransformationViewState, error?: string) => void;
  loadHistory: () => Promise<void>;
  reset: () => void;
}

export function useTransformationState(
  documentId: string,
  transcriptVersion?: number,
): TransformationStateResult {
  const [active, setActiveRaw] = useState<StudyTransformation | null>(null);
  const [viewState, setViewStateRaw] = useState<TransformationViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StudyTransformation[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const isStale = useMemo(() => {
    if (!active || transcriptVersion === undefined) return false;
    return active.transcriptVersion < transcriptVersion;
  }, [active, transcriptVersion]);

  // Reviewer content is null for rapid_recall (rendered separately by RapidRecallView)
  const reviewerContent = useMemo<AnyReviewer | null>(() => {
    if (!active) return null;
    if (active.transformationType === "rapid_recall") return null;
    return active.content as AnyReviewer;
  }, [active]);

  const activate = useCallback(
    (t: StudyTransformation) => {
      setActiveRaw(t);
      const vs: TransformationViewState =
        t.transcriptVersion < (transcriptVersion ?? t.transcriptVersion) ? "stale" : "success";
      setViewStateRaw(vs);
      setError(null);
      // Merge into history list without duplicates
      setHistory((prev) => {
        const exists = prev.some((h) => h.id === t.id);
        if (exists) return prev;
        return [t, ...prev];
      });
    },
    [transcriptVersion],
  );

  const setViewState = useCallback((s: TransformationViewState, err?: string) => {
    setViewStateRaw(s);
    setError(err ?? null);
  }, []);

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    try {
      const res = await fetch(`/api/transformation/history?documentId=${documentId}`);
      const data = await res.json() as { history?: StudyTransformation[] };
      if (Array.isArray(data.history)) {
        setHistory(data.history);
      }
    } catch {
      // Non-fatal — history is supplementary
    } finally {
      setHistoryLoaded(true);
    }
  }, [documentId, historyLoaded]);

  const reset = useCallback(() => {
    setActiveRaw(null);
    setViewStateRaw("idle");
    setError(null);
    fireEvent(ANALYTICS_EVENTS.STALE_TRANSFORMATION_DISMISSED, { documentId });
  }, [documentId]);

  return {
    active,
    reviewerContent,
    viewState,
    error,
    history,
    historyLoaded,
    isStale,
    activate,
    setViewState,
    loadHistory,
    reset,
  };
}

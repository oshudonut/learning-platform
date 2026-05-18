// Analytics event stubs — Phase 5.5 hooks only.
// No provider is wired yet. These stubs ensure typed callsites exist before Phase 7
// plugs in a real analytics service (PostHog, Mixpanel, or custom).
//
// Usage: fireEvent("transformation_completed", { type: "rapid_recall", cached: false })

export const ANALYTICS_EVENTS = {
  // Transformation lifecycle
  TRANSFORMATION_STARTED: "transformation_started",
  TRANSFORMATION_COMPLETED: "transformation_completed",
  TRANSFORMATION_FAILED: "transformation_failed",
  TRANSFORMATION_CACHE_HIT: "transformation_cache_hit",
  TRANSFORMATION_OPENED: "transformation_opened",

  // User intent
  STUDY_MODE_SELECTED: "study_mode_selected",
  REGENERATION_TRIGGERED: "regeneration_triggered",
  STALE_TRANSFORMATION_DISMISSED: "stale_transformation_dismissed",
  STALE_TRANSFORMATION_REGENERATED: "stale_transformation_regenerated",

  // Navigation
  DOCUMENT_VIEWED: "document_viewed",
  TAB_SWITCHED: "tab_switched",
  HISTORY_ITEM_LOADED: "history_item_loaded",

  // Content interaction
  RAPID_RECALL_ITEM_REVEALED: "rapid_recall_item_revealed",
  REVIEWER_SECTION_COMPLETED: "reviewer_section_completed",
} as const;

export type AnalyticsEventName = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];

export type AnalyticsEventPayload = {
  documentId?: string;
  transformationType?: string;
  learningMethod?: string;
  studyMode?: string;
  cached?: boolean;
  transcriptVersion?: number;
  generationTimeMs?: number;
  estimatedCostUsd?: number;
  tabId?: string;
  error?: string;
  [key: string]: unknown;
};

export function fireEvent(name: AnalyticsEventName, payload?: AnalyticsEventPayload): void {
  // Stub: logs in development, no-op in production until provider is wired.
  if (process.env.NODE_ENV === "development") {
    console.log("[analytics]", name, payload ?? {});
  }
  // Future: window.analytics?.track(name, { ...payload, timestamp: Date.now() });
}

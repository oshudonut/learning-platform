// ─── Signal Collector ─────────────────────────────────────────────────────────
//
// Non-blocking, queue-backed signal emitter.
// Designed for drop-in replacement with a real queue (Vercel Queues, etc.).
//
// Contract:
//   - emitSignal() NEVER awaits. Fire and forget.
//   - High-frequency signals (topic_viewed etc.) are debounced per key.
//   - Queue drops signals when full rather than blocking the caller.
//   - flushSignals() drains to an array — caller decides what to do with it.

import { createSignal } from "./learning-signals";
import type { LearningSignal, SignalType } from "./learning-signals";

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_QUEUE_SIZE = 500;

// Debounce windows per signal type — prevents flooding from rapid re-renders
const DEBOUNCE_MS: Partial<Record<SignalType, number>> = {
  topic_viewed: 1200,
  source_opened: 400,
  transcript_navigation: 600,
};

// ─── Module-level state ───────────────────────────────────────────────────────

type QueueEntry = { signal: LearningSignal; enqueuedAt: number };

const _queue: QueueEntry[] = [];
const _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Diagnostics ──────────────────────────────────────────────────────────────

const _diag = {
  emittedTotal: 0,
  droppedTotal: 0,
  flushedTotal: 0,
  lastFlushAt: 0,
  recentTimestamps: [] as number[], // rolling 60-second window
};

function _recordEmit(): void {
  _diag.emittedTotal++;
  const now = Date.now();
  _diag.recentTimestamps.push(now);
  // Keep only the last 60 seconds to avoid unbounded growth
  const cutoff = now - 60_000;
  while (_diag.recentTimestamps.length > 0 && _diag.recentTimestamps[0] < cutoff) {
    _diag.recentTimestamps.shift();
  }
}

export function getSignalDiagnostics() {
  const now = Date.now();
  const window = 10_000;
  const recentCount = _diag.recentTimestamps.filter(t => t > now - window).length;
  return {
    queueSize: _queue.length,
    emittedTotal: _diag.emittedTotal,
    droppedTotal: _diag.droppedTotal,
    flushedTotal: _diag.flushedTotal,
    signalsPerSec: +(recentCount / (window / 1000)).toFixed(2),
    lastFlushAt: _diag.lastFlushAt,
    queueUtilization: +(_queue.length / MAX_QUEUE_SIZE * 100).toFixed(1) + "%",
  };
}

// ─── Internal enqueue ─────────────────────────────────────────────────────────

function _enqueue(signal: LearningSignal): void {
  if (_queue.length >= MAX_QUEUE_SIZE) {
    _diag.droppedTotal++;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[signal-collector] queue full — dropped:", signal.signalType);
    }
    return;
  }
  _queue.push({ signal, enqueuedAt: Date.now() });
  _recordEmit();

  if (process.env.NODE_ENV !== "production" && _queue.length > 0 && _queue.length % 50 === 0) {
    const diag = getSignalDiagnostics();
    console.log("[signal-collector] queue milestone:", diag);
  }
}

// ─── Public: emit ─────────────────────────────────────────────────────────────

export function emitSignal(
  partial: Omit<LearningSignal, "id" | "createdAt">,
): void {
  try {
    const debounceMs = DEBOUNCE_MS[partial.signalType];

    if (debounceMs !== undefined) {
      const key = `${partial.signalType}::${partial.documentId}::${partial.topicId ?? ""}`;
      const existing = _debounceTimers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        _debounceTimers.delete(key);
        _enqueue(createSignal(partial));
      }, debounceMs);
      _debounceTimers.set(key, timer);
      return;
    }

    _enqueue(createSignal(partial));
  } catch {
    // Never throw — signals are best-effort telemetry
  }
}

// ─── Public: batch ────────────────────────────────────────────────────────────

// Returns up to maxBatch signals and removes them from the queue.
// Call periodically or before a flush to a storage backend.
export function batchSignals(maxBatch = 100): LearningSignal[] {
  return _queue.splice(0, maxBatch).map(e => e.signal);
}

// ─── Public: flush ────────────────────────────────────────────────────────────

// Drains the entire queue. Returns all pending signals.
// Caller is responsible for persistence (future: POST to /api/signals).
export function flushSignals(): LearningSignal[] {
  const all = _queue.splice(0).map(e => e.signal);
  _diag.flushedTotal += all.length;
  _diag.lastFlushAt = Date.now();

  if (process.env.NODE_ENV !== "production" && all.length > 0) {
    console.log("[signal-collector] flushed", all.length, "signals", getSignalDiagnostics());
  }

  return all;
}

// ─── Public: peek (non-destructive) ──────────────────────────────────────────

export function peekQueue(): LearningSignal[] {
  return _queue.map(e => e.signal);
}

// ─── Public: persist (client-only) ───────────────────────────────────────────
//
// Flushes the queue and POSTs signals to /api/signals.
// Safe to call from beforeunload (keepalive: true lets the browser complete the
// request after page unload). Returns false on network failure — signals are
// NOT re-queued since they've already been drained; callers that care about
// retries should check the return value and re-enqueue manually.

export async function persistSignals(authUserId: string): Promise<boolean> {
  const signals = flushSignals();
  if (signals.length === 0) return true;

  // Stamp real user ID over the "local" placeholder emitted during setup
  const stamped = signals.map((s) =>
    s.userId === "local" ? { ...s, userId: authUserId } : s,
  );

  try {
    const res = await fetch("/api/signals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signals: stamped }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Public: clear (testing only) ────────────────────────────────────────────

export function clearSignalQueue(): void {
  _queue.length = 0;
  for (const timer of _debounceTimers.values()) clearTimeout(timer);
  _debounceTimers.clear();
}

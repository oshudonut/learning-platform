# Phase D — Regeneration Lifecycle Audit

Branch: `feature/board-review-renderer`
Date: 2026-05-16

---

## Problem Statement

After a user regenerates a reviewer with a new methodology, the UI instantly returns to "All Done" instead of starting a fresh learning lifecycle. The backend generates a new reviewer successfully and resets the DB progression, but the client renders the wrong state.

---

## Root Cause Analysis

### Root Cause 1 — Stale `localIdx` in ReviewerView

**File:** `components/reviewer/ReviewerView.tsx:389`

```typescript
const serverIdx = progression?.currentSectionIndex ?? 0;
const [localIdx, setLocalIdx] = useState<number>(serverIdx);
```

`useState(serverIdx)` initializes `localIdx` ONCE at mount. React never reinitializes `useState` when props change. If ReviewerView stays mounted (or remounts but with a stale prop snapshot), `localIdx` retains the value from the previous session.

The derived index: `Math.max(localIdx, serverIdx)` — if `localIdx` is 5 and `serverIdx` is 0, the old section is displayed.

### Root Cause 2 — "Try Again" drops method/mode

**File:** `app/document/[id]/page.tsx:426`

```typescript
// BEFORE (bug):
onClick={() => loadReviewer(true)}
```

The error-state "Try Again" button calls `loadReviewer(true)` without `method` or `mode`. In the reviewer API:

```typescript
if (force && learningMethod) {
  // reset progression, build freshProgression
}
```

With no `learningMethod`, the condition is false → no progression reset → `freshProgression` is `undefined`. The client falls into the `else if (force || !progression)` branch, which fetches progression from DB. The DB still holds the old completed state → `allComplete=true` → `flashcardChallengeCompleted=true` → ReviewerView renders "All Done".

### Root Cause 3 — No `key` on ReviewerView (defense-in-depth)

**File:** `app/document/[id]/page.tsx:448`

ReviewerView had no `key` prop. If it stayed mounted across state transitions (e.g., due to React 18 batching keeping the parent tree alive), React would reuse the existing instance — retaining `localIdx` and `completing` from the previous session.

---

## Fix Applied

**File:** `app/document/[id]/page.tsx`

### Change 1 — `reviewerKey` state

```typescript
const [reviewerKey, setReviewerKey] = useState(0);
```

Incremented whenever `freshProgression` is applied. Passed as `key={reviewerKey}` to ReviewerView, which forces React to unmount and remount a fresh instance with `localIdx` initialized from the new `serverIdx=0`.

### Change 2 — `pendingMethod` / `pendingMode` state

```typescript
const [pendingMethod, setPendingMethod] = useState<LearningMethod | null>(null);
const [pendingMode, setPendingMode] = useState<StudyMode | null>(null);
```

Stored in `handleMethodSelect` before the API call. Ensures the error-retry path always has access to the last known method/mode.

### Change 3 — Increment `reviewerKey` on `freshProgression`

```typescript
if (data.freshProgression) {
  setProgression(data.freshProgression);
  setRemediationActive(data.freshProgression.remediationActive ?? false);
  setReviewerKey((k) => k + 1);  // ← new
}
```

### Change 4 — Store method/mode in `handleMethodSelect`

```typescript
const handleMethodSelect = useCallback(async (method, mode) => {
  setPendingMethod(method);   // ← new
  setPendingMode(mode);       // ← new
  await fetch(/* save_learning_profile */);
  await loadReviewer(true, method, mode);
}, [id, loadReviewer]);
```

### Change 5 — Fix "Try Again" button

```typescript
// BEFORE:
onClick={() => loadReviewer(true)}

// AFTER:
onClick={() => loadReviewer(true, pendingMethod ?? undefined, pendingMode ?? undefined)}
```

### Change 6 — Add `key` to ReviewerView

```tsx
<ReviewerView
  key={reviewerKey}
  reviewer={reviewer.data}
  // ...
/>
```

---

## Reset Guarantees After Fix

| State | Reset mechanism |
|---|---|
| Section progress | `buildInitialProgression` in reviewer API; applied via `freshProgression` |
| Flashcard challenge | `flashcardChallengeCompleted: false` in `buildInitialProgression` |
| Quiz unlock | `quizUnlocked: false` in `buildInitialProgression` |
| Remediation | `remediationActive: false` in `buildInitialProgression` + `setRemediationActive(false)` |
| Client `localIdx` | `key={reviewerKey}` forces ReviewerView remount → fresh `useState(0)` |
| Client `completing` | same remount |
| DB progression | `upsertProgression(fresh)` with full replacement |
| `rebuildSectionStatuses` interference | Prevented — `freshProgression` is applied directly, bypassing the GET endpoint that triggers `rebuildSectionStatuses` |

---

## What Was NOT Changed

- `app/api/reviewer/route.ts` — no changes (server-side reset already worked)
- `app/api/progression/route.ts` — no changes
- `lib/store.ts` — no changes
- `components/reviewer/ReviewerView.tsx` — no changes
- All adaptive reviewer views — no changes
- All export, quiz, flashcard, tutor routes — no changes
- Zod schemas, DB schema — no changes

---

## Regression Risks

| Risk | Assessment |
|---|---|
| `reviewerKey` increments on every successful regeneration | Low — reviewerKey only changes when `freshProgression` is present, which only happens when `force=true && learningMethod` is set |
| Remount clears scroll position | Acceptable — user is starting a fresh review session |
| `pendingMethod`/`pendingMode` null on first-ever load | Handled — `?? undefined` coerces null to undefined, reviewer API path without method still works for initial loads |
| Adaptive reviewers unaffected | Confirmed — adaptive viewers (conceptual/retrieval/memory/relational) go through their own `useProgressionState` in shared.tsx and are not touched by this change |

---

## Edge Cases Covered

1. **Error retry after completed reviewer**: "Try Again" now passes pendingMethod/pendingMode → API resets progression → freshProgression returned → reviewerKey incremented → ReviewerView remounts fresh.

2. **Normal regeneration via Regenerate button**: reviewer.status goes "idle" → "loading" → "success", so ReviewerView unmounts/remounts naturally. The new `key={reviewerKey}` increment adds defense-in-depth.

3. **Initial first-time load**: `force=false`, no `learningMethod` → API returns cached reviewer without freshProgression → reviewerKey stays 0, pendingMethod/pendingMode stay null → no behavior change.

4. **Section count changes on regeneration**: `buildInitialProgression(id, topicCount)` uses the new topic count. Since freshProgression is applied directly (not via GET), `rebuildSectionStatuses` never runs and cannot restore old completion flags.

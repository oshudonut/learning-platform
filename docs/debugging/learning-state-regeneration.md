# Learning State Regeneration — Debug Report
**Date**: 2026-05-15  
**Status**: FIXED  
**TypeScript**: PASS (0 errors)  
**Build**: PASS

---

## Symptom

After completing a full learning cycle (reviewer → flashcards → quiz), the system enters a permanent "All Done" state. Regenerating the reviewer with a new learning methodology causes:
- ReviewerView immediately renders "All Done" without showing any sections
- Quiz tab remains unlocked (or shows "Remediation Mode") based on the previous cycle's state
- The flashcard challenge completion badge persists
- No path back into the learning flow without a full page refresh and manual DB intervention

---

## Root Cause Analysis

### Bug 1 — PRIMARY: Reviewer regeneration never resets progression (server)

**File**: `app/api/reviewer/route.ts`  
**Location**: Line 91 (before fix)

When `force=true` is sent to the reviewer route (always the case on methodology change), the route:
1. Generates the new reviewer content
2. Calls `updateDocument(id, user.id, { reviewer, contentHash })` — **only updates the document row**
3. Returns immediately

The `document_progressions` table row is **never touched**. It retains all completion state from the previous cycle:

```
sectionStatuses:        [{ completed: true }, { completed: true }, ...]
flashcardChallengeCompleted: true
quizUnlocked:           true
remediationActive:      true   (if quiz was failed)
```

When the client re-fetches progression after reviewer generation, it receives this stale completed record.

**Conditions for "All Done" render** (from `ReviewerView.tsx`):
```ts
const allComplete = completedCount === total && total > 0;
// renders "All Done" when:
allComplete && progression?.flashcardChallengeCompleted === true
```

Both conditions are `true` from the old progression → immediate "All Done".

### Bug 2 — SECONDARY: `remediationActive` client state not synced on force re-fetch

**File**: `app/document/[id]/page.tsx`  
**Location**: `loadReviewer` callback, lines 163–171 (before fix)

After a forced reviewer generation, `loadReviewer` re-fetches progression and calls `setProgression(...)`, but **never calls `setRemediationActive(...)`**. The `remediationActive` useState variable (separate from the `progression` object) stays at its previous value — leaving the quiz tab locked in "Remediation Mode" even when the new progression has `remediationActive: false`.

### Bug 3 — SECONDARY: Manual "Regenerate" button doesn't clear `remediationActive`

**File**: `app/document/[id]/page.tsx`  
**Location**: Manual Regenerate button onClick (before fix)

The button called:
```ts
setReviewer({ status: "idle" });
setProgression(null);
// missing: setRemediationActive(false)
```

`remediationActive` was left as `true`, so the quiz tab continued to show "Remediation Mode" even as the user selected a new method and got a fresh reviewer.

---

## State Audit — What Each Flag Controls

| Field | "All Done" trigger | Quiz locked trigger | Remediation trigger |
|---|---|---|---|
| `sectionStatuses[*].completed` | `allComplete=true` | — | — |
| `flashcardChallengeCompleted` | `allComplete + this=true` → "All Done" | Prerequisite for `quizUnlocked` | — |
| `quizUnlocked` | — | `!quizUnlocked` → 423 + lock icon | — |
| `remediationActive` | — | — | Shows "Remediation Mode" block in quiz tab |
| `masteredAt` | Mastered badge | — | — |

**All of these persisted across reviewer regeneration before the fix.**

---

## Fix — Exact Changes

### 1. `app/api/reviewer/route.ts`

**Added imports:**
```ts
import { ..., upsertProgression } from "@/lib/store";
import { buildInitialProgression } from "@/lib/progression";
```

**Added reset block after `updateDocument`:**
```ts
// Reset learning cycle when regenerating with an explicit methodology.
// Error-recovery retries (force=true, no learningMethod in request) are excluded.
let progressionReset = false;
if (force && learningMethod) {
  const topicCount = ((parsed as { topics?: unknown[] }).topics?.length) ?? 0;
  const prev = await getProgression(id, user.id);
  const fresh = buildInitialProgression(id, topicCount);
  // Carry forward method selections from this request
  fresh.learningMethod = resolvedMethod ?? null;
  fresh.studyMode = resolvedMode ?? null;
  // Preserve mastery history and document identity, reset everything else
  if (prev) {
    fresh.masteredAt = prev.masteredAt;
    fresh.createdAt = prev.createdAt;
  }
  await upsertProgression(fresh);
  progressionReset = true;
}
```

**`progressionReset` flag added to response** so callers can confirm the reset happened.

**Why `force && learningMethod` not just `force`:**
- `force=true` with no `learningMethod` is the "Try Again" error recovery path (generation previously failed, user retried — no new content was produced in the prior attempt, so existing progress is still valid)
- `force=true` with `learningMethod` is always an intentional new methodology cycle from `handleMethodSelect`

### 2. `app/document/[id]/page.tsx` — `loadReviewer` callback

**Before:**
```ts
if (progData.progression) setProgression(progData.progression);
```

**After:**
```ts
if (progData.progression) {
  setProgression(progData.progression);
  setRemediationActive(progData.progression.remediationActive);
}
```

Ensures `remediationActive` client state stays in sync with server after any forced re-fetch.

### 3. `app/document/[id]/page.tsx` — Manual Regenerate button

**Before:**
```ts
setReviewer({ status: "idle" });
setProgression(null);
```

**After:**
```ts
setReviewer({ status: "idle" });
setProgression(null);
setRemediationActive(false);
```

Optimistic clear of remediation state while the user picks a new method. The subsequent `loadReviewer(true, method, mode)` call (via `handleMethodSelect` → MethodSelection) will write the authoritative server state back.

---

## State Transitions After Fix

### Methodology regeneration (happy path, previously completed document)

| Step | Server progression state | Client state |
|---|---|---|
| Before: cycle complete | `allComplete=true`, `flashcardChallengeCompleted=true`, `quizUnlocked=true` | "All Done" shown |
| User clicks Regenerate | — | `reviewer="idle"`, `progression=null`, `remediationActive=false` |
| MethodSelection shown | — | Waiting for method pick |
| User selects method → `handleMethodSelect` | `save_learning_profile` writes `learningMethod` + `studyMode` | — |
| `loadReviewer(true, method, mode)` fires | Reviewer route generates new content, then **resets progression**: `sectionStatuses` all false, `flashcardChallengeCompleted=false`, `quizUnlocked=false`, `remediationActive=false`. Preserves `masteredAt`, `createdAt` | — |
| Client re-fetches progression (`action=get`) | Returns fresh progression | `setProgression(fresh)`, `setRemediationActive(false)` |
| ReviewerView renders | `allComplete=false`, `flashcardChallengeCompleted=false` | Section 1 shown — new cycle begins |

### Error-recovery retry (force=true, no learningMethod)

| Step | Server progression state |
|---|---|
| User is mid-cycle | Partial completion state |
| Generation fails | No change to document.reviewer |
| User clicks "Try Again" | `loadReviewer(true)` — no `learningMethod` in body |
| **Reset is NOT triggered** | Progression preserved — partial progress intact |

### Normal first-time generation

| Step | Server |
|---|---|
| `loadReviewer(false)` | Returns cached reviewer or generates (no force) |
| Reset block skipped | `force=false` → condition never enters |

---

## Preserved Fields on Reset

| Field | Preserved | Rationale |
|---|---|---|
| `masteredAt` | ✅ | Documents that the user completed a prior cycle — history |
| `createdAt` | ✅ | Tracks when study on this document began |
| `learningMethod` | ✅ | Set to the new method from the current request |
| `studyMode` | ✅ | Set to the new mode from the current request |
| `currentDifficultyLevel` | ❌ Reset to `beginner` | A new methodology is a new challenge type |
| `sectionStatuses` | ❌ Reset | New reviewer content = new reading cycle |
| `checkpointStatuses` | ❌ Reset | Checkpoints are tied to section indices |
| `flashcardChallengeCompleted` | ❌ Reset | Must re-earn for new cycle |
| `quizUnlocked` | ❌ Reset | Must re-earn for new cycle |
| `remediationActive` | ❌ Reset | Fresh start |
| `remediationCompletedAt` | ❌ Reset | Belongs to old cycle |
| `currentSectionIndex` | ❌ Reset to 0 | Start from beginning |

---

## Regression Verification

| Scenario | Expected | Status |
|---|---|---|
| First reviewer generation | Progression created fresh, sections shown | ✅ Unaffected (force=false path) |
| Section complete → checkpoint → quiz unlock | State transitions preserved | ✅ Unaffected (progression write paths unchanged) |
| Quiz fail → remediation → quiz retry | remediationActive set/cleared correctly | ✅ Unaffected |
| Error recovery "Try Again" | No progression reset, partial progress preserved | ✅ Excluded by `force && learningMethod` guard |
| Methodology change → full reset | All completion state cleared, new cycle begins | ✅ Fixed |
| `masteredAt` badge after re-cycle | Badge still shows on document header | ✅ Field preserved |

---

## Files Changed

| File | Change |
|---|---|
| `app/api/reviewer/route.ts` | Added `upsertProgression` + `buildInitialProgression` imports; added progression reset block after `updateDocument`; added `progressionReset` to response |
| `app/document/[id]/page.tsx` | `loadReviewer`: sync `remediationActive` after forced progression re-fetch; manual Regenerate button: add `setRemediationActive(false)` |

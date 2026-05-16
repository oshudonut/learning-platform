# Reviewer Regeneration Bug Fix

## Symptom

After clicking Regenerate → selecting a method → waiting for generation, the UI
immediately shows "All Done" instead of the fresh reviewer. The new reviewer content
is present in the DB but never becomes visible.

## Root Cause

`loadReviewer(true, method, mode)` has this sequence:

1. `handleMethodSelect` calls `save_learning_profile` — this PRESERVES the old
   completion state (`sectionStatuses` all completed, `flashcardChallengeCompleted: true`,
   `quizUnlocked: true`) in the DB, only updating `learningMethod`/`studyMode`.
2. `handleMethodSelect` calls `loadReviewer(true, method, mode)`.
3. The reviewer API generates the new reviewer, calls `upsertProgression(fresh)` to
   reset progress, then responds with `{ progressionReset: true }` — but WITHOUT the
   fresh progression object itself.
4. The client sees `progressionReset: true` (or `force = true`) and re-fetches
   `/api/progression` to sync state.
5. The progression GET's `rebuildSectionStatuses` can be triggered if the new reviewer
   has a different topic count than the stale sectionStatuses length. It PRESERVES
   `flashcardChallengeCompleted` and all-completed `sectionStatuses` from whatever is
   currently in the DB row at that moment — which, due to timing, may still reflect the
   old completed state.
6. `setProgression(oldCompleted)` fires. `ReviewerView` sees
   `allComplete && flashcardChallengeCompleted` → renders "All Done".

## Fix

Return `freshProgression` directly in the reviewer API response when the progression
was reset. The client applies it immediately via `setProgression(data.freshProgression)`
without any server re-fetch, bypassing `rebuildSectionStatuses` entirely.

- Error-retry path (`force=true`, no `learningMethod`) is unaffected — it still goes
  through the normal re-fetch.
- Initial load path (`force=false`) is unaffected.

## Files Changed

- `app/api/reviewer/route.ts` — expose `freshProgression` in the JSON response when
  `progressionReset = true`
- `app/document/[id]/page.tsx` — in `loadReviewer`, prefer `data.freshProgression`
  over the progression re-fetch when the API provides it

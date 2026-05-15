---
name: project-compete-match-ui
description: Compete page and match lobby UI architecture — real-time hooks, challenge modal, friend presence
metadata:
  type: project
---

The compete/match system uses Supabase Realtime for live updates instead of polling.

**Why:** Replaced setInterval polling (5s invitations, 1s match state) with Supabase Realtime postgres_changes subscriptions for lower latency and less wasted bandwidth.

**How to apply:** When extending competitive features, use the existing hook contracts rather than re-introducing polling.

## Hook locations (hooks/ at project root)
- `hooks/usePresence.ts` — broadcasts user presence, returns `{ onlineMap: Map<string, { userId, status }> }`. Currently a stub; real implementation uses Supabase Realtime presence channels.
- `hooks/useChallengeListener.ts` — subscribes to match_rooms INSERT filtered by invited_user_id. Fires onChallenge(matchId) callback. Callback must be stable (use ref pattern to avoid re-subscription).
- `hooks/useMatchRealtime.ts` — subscribes to match_rooms + match_participants + match_answers for a given matchId. Accepts initialState seed, returns live { match, participants, answers }.

## Component locations
- `components/compete/ChallengeModal.tsx` — fullscreen overlay modal for incoming live challenges. Receives onAccept/onDecline as async callbacks; manages its own loading states internally.
- `components/compete/FriendCard.tsx` — friend row with animated presence dot and disabled-aware challenge button.

## Data flow pattern (match page)
Two-phase: fetch once on mount → seed useMatchRealtime → hook owns authoritative state thereafter. fetchState() is kept for post-answer score sync only (realtime handles question advancement).

## Compete page challenge flow
useChallengeListener fires → fetch /api/match/invitations → find matching invitation → setPendingChallenge → ChallengeModal renders. Accept navigates to /match/[id]; decline calls /api/match/[id]/decline then refreshes stale list.

## Removed from match lobby
Room code display, copy button, and onCopy/copied props — matches are now invitation-only, not join-by-code.

[[project-platform-overview]]

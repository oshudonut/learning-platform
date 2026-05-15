# Continuation Guide

How to pick up this project in a new session.

---

## Orientation

Read these in order:
1. `CLAUDE.md` — stack, env vars, DB tables, mastery flow, file map, conventions
2. `docs/handoffs/implementation-status.md` — what's committed vs in working tree
3. `docs/handoffs/unfinished-items.md` — full backlog with severity
4. `docs/architecture/current-system-state.md` — system snapshot

---

## Current Branch State

- Branch: `main`
- Last commit: `a2c12a4` (Stage 1 security hardening)
- Working tree: clean TypeScript (`npx tsc --noEmit` passes), **not yet committed**
- 20 modified/untracked files representing the adaptive methodology feature

---

## First Actions in a New Session

### 1. Commit the working tree
```bash
npx tsc --noEmit   # verify still clean
git add app/api/checkpoint-flashcards/route.ts \
        app/api/flashcards/route.ts \
        app/api/progression/route.ts \
        app/api/quiz/route.ts \
        app/api/remediation/route.ts \
        app/api/tutor/route.ts \
        app/document/[id]/page.tsx \
        components/flashcard/FlashcardStudy.tsx \
        components/quiz/QuizEngine.tsx \
        components/reviewer/ReviewerView.tsx \
        components/tutor/TutorChat.tsx \
        components/upload/ReviewerSetupModal.tsx \
        lib/learning-methods.ts \
        lib/prompts.ts \
        lib/store.ts \
        supabase/final_isolation_hardening.sql \
        HANDOFF.md
git commit -m "feat: adaptive methodology integration — learningMethod wired through all generation pipelines"
```

The pre-existing uncommitted changes (`app/library/page.tsx`, `app/page.tsx`, `components/library/DocumentCard.tsx`, `components/library/FolderCard.tsx`, `app/auth/callback/route.ts`) can go in a separate commit or the same one.

### 2. Run pending Supabase migrations

In Supabase SQL Editor, run in order:

**First** — check for orphan rows before the destructive migration:
```sql
SELECT COUNT(*) FROM documents          WHERE user_id IS NULL;
SELECT COUNT(*) FROM quiz_attempts      WHERE user_id IS NULL;
SELECT COUNT(*) FROM flashcard_sessions WHERE user_id IS NULL;
SELECT COUNT(*) FROM analytics_meta     WHERE user_id IS NULL;
```

**Then run** (in Supabase SQL Editor):
1. `supabase/security_hardening_migration.sql`
2. `supabase/final_isolation_hardening.sql` (only after confirming orphan counts are expected)

### 3. Rotate `ANTHROPIC_API_KEY`
The key was accidentally exposed in a prior session. Rotate it in the Anthropic console and update in Vercel environment variables + `.env.local`.

---

## Recommended Next Stage: Stage 2 Remainder

With the methodology feature shipped and migrations run, the next highest-priority work is the remaining Stage 2 educational integrity items. Start here:

### `reviewer_topics` table (C4 — blocks quiz coherence)
1. Add `reviewer_topics` table: `(id, document_id, topic_titles jsonb, content_hash text, created_at)`
2. After reviewer generation in `app/api/reviewer/route.ts`, write `topicTitles` to the table
3. In `app/api/quiz/route.ts`, read `reviewer_topics` for the document and add: `"Cover ONLY these topics: [list]"` to the quiz prompt
4. This fixes the C4 gap where quiz tests content never covered in the reviewer

### Checkpoint skip bypass (C2 — mastery gate broken)
In `app/api/progression/route.ts`, `complete_checkpoint` action:
- Query `flashcard_review_events` (or equivalent) for at least one record tied to this checkpoint
- If zero records: return 400 or mark `skipped=true` rather than accepting clean completion
- Remove or disable the "Skip Checkpoint" button in `components/reviewer/CheckpointChallenge.tsx` when it's triggered by load failure (show error state instead)

### Remediation read-gate (H8)
In `app/api/remediation/route.ts`, `complete_remediation` action:
- Require a `lastReadAt` timestamp on the remediation reviewer record before accepting completion
- `ReviewerView` should write a read timestamp when the user reaches the last section

---

## Stage 3 — AI Efficiency (after Stage 2)

### Token capping (AI-2) — high cost impact
```ts
// Add to lib/claude.ts or lib/utils.ts
export function getContextForGeneration(doc: Document, maxChars = 12000): string {
  return doc.text.slice(0, maxChars);
}
```
Apply to `app/api/quiz/route.ts` and `app/api/flashcards/route.ts` — removes ~50K token waste per generation.

### Haiku routing (AI-4)
```ts
// lib/claude.ts
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
```
Route to Haiku: open-answer grading (`app/api/quiz/grade-open/`) and checkpoint flashcard generation.

### Tutor prompt caching (AI-5)
In `lib/claude.ts`, `streamTutorResponse()`: add `cache_control: { type: "ephemeral" }` to the system prompt message block. One-line change, ~10x cost reduction on long tutor sessions.

---

## Key Conventions

- All DB access through `lib/store.ts` — never query Supabase directly from a route
- `"use client"` only where hooks/events are needed — prefer server components
- Quiz lock enforced server-side (423 status) — never just in UI
- DOCX export locked server-side (403) until `quizUnlocked`
- All AI content via `generateStructured()` with Zod validation
- Every new store function must include `.eq("user_id", userId)` — service key bypasses RLS

---

## Environment Variables
```
SUPABASE_URL=https://tawysubhylucwzpkwokn.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
ANTHROPIC_API_KEY=sk-ant-...   ← ROTATE THIS
```

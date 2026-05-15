# Session Handoff — 2026-05-15 (Session 2)

## Goal

Wire `learningMethod` through every AI generation pipeline in the Second Brain platform so a student's chosen study methodology shapes reviewer structure, flashcards, quiz framing, tutor behavior, and mastery progression feedback — end-to-end, not just in the reviewer.

---

## What Was Completed This Session

### Adaptive Methodology Integration — SHIPPED (uncommitted, clean working tree)

A 5-agent coordinated team (`adaptive-methodology-team`) executed this feature across 4 waves. Nothing is committed yet — all changes are clean in the working tree on top of `a2c12a4`.

---

### Wave 1 — Data safety + shared config

#### Bug fix: `rebuildSectionStatuses` data-loss (`app/api/progression/route.ts`)
`rebuildSectionStatuses()` was rebuilding a fresh `DocumentProgression` from the DB row but not copying `learningMethod` or `studyMode`. Any operation that triggered a rebuild silently wiped those fields. Fixed with 2 lines:
```ts
fresh.learningMethod = progression.learningMethod;
fresh.studyMode = progression.studyMode;
```

#### New file: `lib/learning-methods.ts`
Single source of truth for methodology display config, badge components, and per-surface hint copy. All 13 methods defined:
`feynman`, `active_recall`, `spaced_repetition`, `blurting`, `mind_maps`, `mnemonic`, `interleaving`, `elaboration`, `sq3r`, `pq4r`, `leitner`, `pomodoro`, `multisensory`

Exports:
- `METHOD_CONFIG` — per-method badge label, Tailwind accent class, section field labels, reviewer-surface hint
- `getMethodHint(method, surface)` — returns hint string for `reviewer | quiz | flashcard | tutor`, or `null`
- `MethodBadge` — shared React pill component used by all 4 study surfaces
- `SURFACE_HINT_OVERRIDES` — populated with per-surface instructional copy for all 13 methods (see Wave 3b)

---

### Wave 2 — Prompt layer + API routes

#### `lib/prompts.ts` — method-aware builders for all 4 generation paths

| Function | What changed |
|---|---|
| `buildFlashcardTask(method?)` | 12-method instruction map — Feynman gets explain-in-plain-language fronts, Active Recall gets zero-context-clue retrieval questions, Mnemonic requires actual memory anchor in every `hint` field |
| `buildTutorSystemPrompt(method?)` | 13-method addendum — Feynman asks student to explain simply then probes gaps, Active Recall forces retrieval before answering, Elaboration always asks "why?" and traces mechanisms |
| `TUTOR_WITH_CONTEXT(context, title, method?)` | Signature updated to accept `method` |
| `buildCheckpointFlashcardTask(topicTitles, method?)` | Method framing applied; topic-coverage constraint takes absolute priority over method style |
| `buildQuizTask({ ..., learningMethod? })` | Per-method question-type mix ratios — Active Recall: 40% fill-in-the-blank; Mnemonic: 60% MC (recognition-heavy); Elaboration/Feynman: 35% identification questions requiring explanation |
| `buildRemediationPreamble(weakTopics, schemaFamily?)` | Extracted from const to function; accepts schema family for method-aware remediation structure |
| `getRemediationConfig()` | New export — typed helper for remediation route to get generation config |

#### API routes — `learningMethod` threaded from progression into all prompts

Every route now calls `getProgression(id, user.id)` and passes `progression?.learningMethod` to the relevant prompt builder:

| Route | Change |
|---|---|
| `app/api/quiz/route.ts` | `buildQuizTask({ ..., learningMethod: progression?.learningMethod })` |
| `app/api/flashcards/route.ts` | `buildFlashcardTask(progression?.learningMethod)` + added `getProgression` call |
| `app/api/checkpoint-flashcards/route.ts` | `buildCheckpointFlashcardTask(topicTitles, progression?.learningMethod)` |
| `app/api/tutor/route.ts` | `TUTOR_WITH_CONTEXT(context, doc.title, progression?.learningMethod)` + added `getProgression` call |
| `app/api/remediation/route.ts` | Method-aware remediation structure via `getRemediationConfig()` |

---

### Wave 3 — Frontend

#### Wave 3a — `<MethodBadge />` in all study surfaces

`learningMethod` prop added to `FlashcardStudy`, `QuizEngine`, and `TutorChat`. `<MethodBadge />` imported from `lib/learning-methods.ts` and rendered in each:
- **FlashcardStudy** — alongside "Card X of Y" counter
- **QuizEngine** — in quiz header
- **TutorChat** — with "Study approach: [method]" label next to document context indicator

#### Wave 3b — `SURFACE_HINT_OVERRIDES` populated + modal expansion

`SURFACE_HINT_OVERRIDES` in `lib/learning-methods.ts` is now fully populated for `quiz`, `flashcard`, and `tutor` surfaces across all applicable methods (Pomodoro intentionally has no quiz/flashcard hint — it's a time technique, not a content technique). Example:
- `quiz.feynman` → "Think about the mechanism — understanding *why* matters more than recognizing the answer."
- `flashcard.active_recall` → "No peeking. Commit to a complete answer in your head before flipping."
- `tutor.mnemonic` → "Expect the tutor to generate and use memory anchors — engage with the actual device, not just the label."

`ReviewerSetupModal` expanded from 6 to 13 methods with updated icons (`Mic`, `Shuffle`, `ListChecks`, `Bookmark`, `Boxes`, `Timer`, `Eye`).

`ReviewerView.tsx` and `app/document/[id]/page.tsx` updated to thread `learningMethod` prop down into study components.

---

## What Still Needs to Be Done

### Commit this work
All changes are in the working tree, uncommitted. Before deploying:
1. Run `npx tsc --noEmit` to confirm TypeScript is clean
2. Commit with message covering: bug fix, learning-methods.ts, prompt layer, API routes, frontend badges
3. Run `supabase/security_hardening_migration.sql` in Supabase SQL Editor (from Stage 1, still pending)

### Remaining from the architectural audit staged plan

#### Stage 2 — Educational Integrity (partially done this session)
- [x] Wire `learningMethod` to quiz + flashcard + checkpoint + tutor prompts (AI-3) — **DONE**
- [ ] Create `reviewer_topics` table (DB-5) — reviewer generation must write canonical topic list post-generation
- [ ] Update quiz route to read `reviewer_topics` and pass as hard constraint: "Cover ONLY these topics" (AI-1) — *blocks reviewer→quiz coherence (C4)*
- [ ] Fix checkpoint skip bypass — server-side guard requiring at least one `flashcard_review_event` (DB-6) — *C2, mastery gate broken*
- [ ] Fix remediation gate — section-read timestamp check before `complete_remediation` unlocks quiz (DB-7) — *H8*

#### Stage 3 — AI Efficiency
- [ ] `getContextForGeneration(doc, maxChars)` shared function (AI-2) — quiz and flashcard routes still send uncapped `doc.text` (~50K tokens)
- [ ] `HAIKU_MODEL` constant; route open-answer grading + checkpoint flashcard generation to Haiku (AI-4)
- [ ] `cache_control: { type: "ephemeral" }` on tutor system prompt block (AI-5) — H4, 20-turn sessions pay full input cost 20×

#### Stage 4 — Frontend Robustness
- [ ] Rollback on `submitDocRename` and `handleDocMove` on failure (FE-1)
- [ ] Multi-file upload: per-file status + link each succeeded doc (FE-2)
- [ ] Session expiry mid-session: coordinated sign-out instead of silent API failures (FE-4)

#### Stage 5 — DB Performance
- [ ] `listDocuments` — stop SELECTing full JSON blobs; compute `hasReviewer` etc. in SQL (H6)
- [ ] Missing indexes: `documents_user_id_idx`, `documents_content_hash_uidx`, `user_profiles_xp_idx` (H9)
- [ ] `updateDocument` direct `.update()` — remove sequential read leg
- [ ] Pagination on `getAnalytics`

#### Critical issues still open (C1, C3)
- **C1** — `getDocument(id)` still has NO `userId` filter. `getProgression(documentId)` (non-ownership path), `getDocumentByContentHash`, `saveFlashcardReviewStates`, `saveChunks` need patching. `supabase/security_hardening_migration.sql` adds the columns; the store functions need corresponding `.eq("user_id", userId)` guards.
- **C3** — `upsertProgression` is still a full-row read-modify-write. Two-tab race can silently unmark a checkpoint. Needs Postgres-level `jsonb_set()` or `updated_at` optimistic locking.

---

## Files Changed This Session (uncommitted)

```
app/api/checkpoint-flashcards/route.ts    — learningMethod wired
app/api/flashcards/route.ts               — learningMethod wired + getProgression added
app/api/progression/route.ts              — rebuildSectionStatuses bug fix (2 lines)
app/api/quiz/route.ts                     — learningMethod wired
app/api/remediation/route.ts              — method-aware remediation via getRemediationConfig
app/api/tutor/route.ts                    — learningMethod wired + getProgression added
app/document/[id]/page.tsx                — learningMethod prop threaded to study components
components/flashcard/FlashcardStudy.tsx   — learningMethod prop + MethodBadge
components/quiz/QuizEngine.tsx            — learningMethod prop + MethodBadge
components/reviewer/ReviewerView.tsx      — cleanup, learningMethod threading
components/tutor/TutorChat.tsx            — learningMethod prop + MethodBadge
components/upload/ReviewerSetupModal.tsx  — expanded to 13 methods, new icons
lib/learning-methods.ts                   — NEW: shared methodology config + MethodBadge + SURFACE_HINT_OVERRIDES
lib/prompts.ts                            — method-aware builders for all 4 generation paths
lib/store.ts                              — minor typing fixes

Pre-existing uncommitted (from prior session, not related to this feature):
app/auth/callback/route.ts
app/library/page.tsx
app/page.tsx
components/library/DocumentCard.tsx
components/library/FolderCard.tsx
```

---

## Architecture Decisions Made This Session

1. **`lib/learning-methods.ts` as single source of truth** — all 4 surfaces import `METHOD_CONFIG`, `MethodBadge`, and `getMethodHint` from one file. Reviewer UI already had its own method-display logic; it has been consolidated. Adding a new method requires touching only this file + prompts.ts.

2. **`SURFACE_HINT_OVERRIDES` intentionally separate from `METHOD_CONFIG`** — reviewer hints are inside `METHOD_CONFIG` (set at method definition time); non-reviewer surface hints live in `SURFACE_HINT_OVERRIDES` because they are surface-specific instructional copy, not method definitions. Keeps the two concerns separate.

3. **Prompt builders are additive, not branching** — each method-aware builder prepends the method instruction to the base task string. The base task is unchanged; method instructions are prefix additions. This means method=undefined always falls through to existing behavior — zero regression risk for documents that don't have a `learningMethod` set.

4. **Pomodoro has no flashcard/quiz framing** — Pomodoro is a time-management technique, not a content technique. It has a tutor persona (suggests study breaks at concept boundaries) but intentionally returns `null` from `getMethodHint` for quiz and flashcard surfaces so those components render nothing rather than a misleading hint.

5. **`rebuildSectionStatuses` fix promoted to Wave 1** — originally queued for Wave 2 as a bundled fix; the lead agent promoted it to a standalone immediate fix because any `learningMethod` write followed by a progression rebuild would immediately wipe the value we just wrote. Correct sequencing: fix the wipe first, then add the writes.

---

## What Was Tried and Failed

- None this session. The coordinated team approach prevented the main failure mode (agents implementing incompatible interfaces in isolation).

---

## Key Reference

The full prior-session architectural audit (C1–C4, H1–H10, cross-agent contracts DB-1 through DB-8, AI-1 through AI-6, FE-1 through FE-4) is documented in the previous HANDOFF.md. The staged plan in this document supersedes the prior staged plan only for Stage 2 item 6 (learningMethod wiring, now complete). All other items from the prior plan remain outstanding.

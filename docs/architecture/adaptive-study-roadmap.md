# Adaptive Study Intelligence — Implementation Roadmap

---

## Preamble: Sequence Rationale

The implementation order is determined by dependency graph, not feature value. Systems C (Highlights) depends on having the rendering infrastructure established by B (Notes). System D (Companion) depends on analytics data from E (Learning Analytics). System F (Export Injection) depends on both B and C being complete. System A (Collections) is structurally independent and is built first because it provides the organizational layer that makes subsequent features more coherent during testing.

The sequence also respects a **zero-regression guarantee**: at no phase does any new migration alter an existing table column, drop an existing index, or change an existing API contract. Every migration is purely additive.

---

## Phase 0: Foundation Audit (before any implementation)

**Purpose:** Verify that the existing codebase is in a state that can safely receive additive changes, and establish the integration contracts that new systems must honor.

**What gets done:**

- Confirm all existing tables exist in Supabase with correct schema (run diff against `schema.sql` and `progression_schema.sql`)
- Confirm `user_id` column exists on `quiz_attempts`, `flashcard_sessions`, `analytics_meta`, `conversations`, `document_progressions`, `checkpoint_flashcards`, `remediation_reviewers` — the progression schema was written before multi-user auth was enforced; verify these columns are present and indexed
- Confirm `app/api/export/route.ts` returns 422 (not 500) for adaptive reviewers — verify this guard is working before building the injection layer on top of it
- Confirm `lib/store.ts` pattern: all functions accept `userId` and scope queries to it — document any functions that do not (they should not accept the new annotation queries without this guard)
- Read `lib/progression.ts` to confirm `PASSING_SCORE`, checkpoint thresholds, and `buildInitialProgression` — these must not be touched by any new phase
- Confirm the `randomId()` utility in `lib/utils.ts` is the canonical ID generator — all new tables use it for primary keys

**DB migrations required:** None

**Dependencies:** None

**Risk level:** Low

**Estimated complexity:** S

**Zero-regression checklist:**
- [ ] All existing API routes return same responses as before audit
- [ ] No existing table schemas modified
- [ ] No existing store functions modified

---

## Phase 1: Study Collections

**What gets built:**

- DB migration: `study_collections` + `collection_items` tables
- Store functions: `createCollection`, `listCollections`, `getCollection`, `updateCollection`, `deleteCollection`, `addDocumentToCollection`, `removeDocumentFromCollection`, `reorderCollectionItems`, `listCollectionItems`
- API route: `app/api/collections/route.ts` (GET list, POST create, PATCH update, DELETE)
- API route: `app/api/collections/[id]/items/route.ts` (GET items, POST add, DELETE remove, PATCH reorder)
- UI: Collections list page at `app/collections/page.tsx`
- UI: Collection detail page at `app/collections/[id]/page.tsx` showing documents in order with their progression state
- Sidebar nav entry: "Collections" between Library and Analytics
- No changes to `DocumentPage`, reviewer generation, or progression

**DB migrations required:**

```sql
-- Migration: 001_study_collections.sql
create table if not exists study_collections (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  color        text not null default 'blue',
  created_at   bigint not null,
  updated_at   bigint not null
);
create index if not exists idx_study_collections_user on study_collections(user_id);

create table if not exists collection_items (
  id              text primary key,
  collection_id   text not null references study_collections(id) on delete cascade,
  document_id     text not null references documents(id) on delete cascade,
  position        real not null,
  added_at        bigint not null,
  unique(collection_id, document_id)
);
create index if not exists idx_collection_items_collection on collection_items(collection_id, position);
create index if not exists idx_collection_items_document on collection_items(document_id);
```

**Dependencies on prior phases:** Phase 0 audit complete

**Risk level:** Low

**Estimated complexity:** M

**Zero-regression checklist:**
- [ ] Existing `listDocuments`, `getDocument`, `saveDocument` functions unchanged
- [ ] `DocumentPage` renders identically — no new props, no new state
- [ ] Collection delete does not cascade to documents (only to collection_items)
- [ ] Adding a document to a collection does not modify the document's `folder_id` or any other field
- [ ] Export routes unchanged — collection export route is new, not a modification

---

## Phase 2: Structured Notes

**What gets built:**

- DB migration: `reviewer_notes` table
- Store functions: `upsertNote`, `getNotesByDocument`, `deleteNote`
- API route: `app/api/notes/route.ts` (GET by document, POST/PATCH upsert, DELETE)
- Component: `ReviewerNotepad` — a textarea with debounced autosave, confusion level selector (1-5 stars), "Saved" / "Unsaved" indicator. Lives in `components/reviewer/ReviewerNotepad.tsx`
- Integration: `BoardExamTopicRenderer` receives an optional `note` prop and renders `ReviewerNotepad` below the topic content. The note data is loaded in `DocumentPage` via a batch fetch for all topics at once
- No changes to reviewer generation, progression, or quiz routes
- `learning_analytics` event `note_created` is also inserted at this phase (forward-compatible with Phase 6 analytics table)

**DB migrations required:**

```sql
-- Migration: 002_reviewer_notes.sql
create table if not exists reviewer_notes (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  document_id       text not null references documents(id) on delete cascade,
  topic_index       integer not null,
  note_text         text not null default '',
  ai_tags           jsonb,
  confusion_level   integer check (confusion_level between 1 and 5),
  linked_concepts   text[],
  created_at        bigint not null,
  updated_at        bigint not null,
  unique(user_id, document_id, topic_index)
);
create index if not exists idx_reviewer_notes_doc on reviewer_notes(user_id, document_id);
create index if not exists idx_reviewer_notes_topic on reviewer_notes(document_id, topic_index);
```

Note: The `learning_analytics` table is also created in this migration as an empty table, so Phase 2 can write `note_created` events to it without waiting for Phase 6. Phase 6 then adds the full analytics instrumentation.

```sql
-- Also in Migration 002 — create analytics table early for forward compatibility
create table if not exists learning_analytics (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  document_id   text references documents(id) on delete set null,
  event_type    text not null,
  event_data    jsonb not null default '{}',
  recorded_at   bigint not null
);
create index if not exists idx_learning_analytics_user on learning_analytics(user_id, recorded_at desc);
create index if not exists idx_learning_analytics_doc on learning_analytics(user_id, document_id, event_type);
```

**Dependencies on prior phases:** Phase 1 (establishes migration file conventions, not a functional dependency)

**Risk level:** Low-Medium

**Estimated complexity:** M

**Zero-regression checklist:**
- [ ] `ReviewerView` and `BoardExamTopicRenderer` remain functional when `note` prop is absent — all note props are optional
- [ ] Notes batch fetch failure does not block reviewer render — catch and render without notes
- [ ] Adaptive reviewer views (`ConceptualReviewerView`, `RetrievalReviewerView`, etc.) are not modified in this phase — notes integration for adaptive types is a follow-on task
- [ ] `upsertNote` uses the unique constraint's ON CONFLICT clause — never inserts duplicates
- [ ] Debounce does not fire on component unmount — cleanup the debounce timer in useEffect cleanup

---

## Phase 3: Highlights

**What gets built:**

- DB migration: `reviewer_highlights` table
- Store functions: `createHighlight`, `getHighlightsByDocument`, `markHighlightsStale`, `deleteHighlight`
- API route: `app/api/highlights/route.ts` (GET by document, POST create, DELETE, PATCH mark-stale)
- Component: `HighlightableText` — wraps a string with selection detection and renders highlight spans. Lives in `components/reviewer/primitives/HighlightableText.tsx`
- Integration: `BoardExamTopicRenderer` wraps each field's text rendering through `HighlightableText`. Highlights are batch-loaded alongside notes in `DocumentPage`
- Color picker: inline popover on text selection (4 colors: yellow, green, blue, pink)
- Stale indicator: dismissable banner when `is_stale=true` highlights exist for the document
- Hook into `app/api/reviewer/route.ts`: after saving a regenerated reviewer, call `markHighlightsStale(documentId, userId)` — this is the one integration touch point with an existing route, and it is additive (no existing behavior changes, it just adds a side-effect call)

**DB migrations required:**

```sql
-- Migration: 003_reviewer_highlights.sql
create table if not exists reviewer_highlights (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  document_id     text not null references documents(id) on delete cascade,
  topic_index     integer not null,
  field_name      text not null,
  item_index      integer,
  char_start      integer not null,
  char_end        integer not null,
  color_tag       text not null default 'yellow',
  is_stale        boolean not null default false,
  created_at      bigint not null
);
create index if not exists idx_reviewer_highlights_doc on reviewer_highlights(user_id, document_id);
create index if not exists idx_reviewer_highlights_topic on reviewer_highlights(document_id, topic_index, field_name);
```

**Dependencies on prior phases:** Phase 2 (notes batch-load pattern established; `learning_analytics` table created)

**Risk level:** Medium

**Estimated complexity:** L

**Risks specific to this phase:**
1. **Text selection mapping:** Mapping Selection API offsets to `(field_name, item_index, char_start, char_end)` requires data attributes on each text container. This must be implemented carefully to handle `SemanticLabel` prefix stripping — the highlight coordinates reference the raw string, not the post-rendered text
2. **SemanticLabel interaction:** `SemanticLabel` strips a prefix pattern and renders the remainder. Highlights applied to the remainder must be stored relative to the original full string, not the post-stripped text. Coordinate mapping must account for the prefix length
3. **Re-render stability:** Highlights that split a string into 3 TextRun segments (before, highlighted, after) must be stable across re-renders. Use the highlights data directly as render input, not derived state

**Zero-regression checklist:**
- [ ] `HighlightableText` degrades to plain text rendering when no highlights exist — no visual difference from current state
- [ ] `markHighlightsStale` is called in reviewer generation API only when `force=true` AND `learningMethod` is present (same condition as progression reset) — not on every force regeneration
- [ ] Selection events do not fire on quiz or flashcard components — highlight UI is scoped to `ReviewerView` only
- [ ] Stale highlights are excluded from export (is_stale check in export query)

---

## Phase 4: Export Annotation Injection

**What gets built:**

- Modify `app/api/export/route.ts`: after fetching document, fetch `reviewer_notes` and `reviewer_highlights` for that document, inject into `buildDocx()` pipeline
- New function `buildAnnotatedDocx()` in `app/api/export/route.ts` that replaces `buildDocx()` — accepts notes map + highlights map as additional arguments. Old `buildDocx` signature is preserved as a fallback if no annotations exist (same output)
- New route: `app/api/export/collection/route.ts` — collection export bundling N annotated DOCX sections
- `app/api/export/pdf/route.ts` — add notes injection (underline-based highlights, not background color)

**DB migrations required:** None (all tables created in prior phases)

**Dependencies on prior phases:** Phase 2 (notes), Phase 3 (highlights), Phase 1 (collection export needs `collection_items`)

**Risk level:** Low-Medium

**Estimated complexity:** M

**Zero-regression checklist:**
- [ ] A document with no notes and no highlights produces a DOCX byte-for-byte identical to the current export — verify with a diff test before and after
- [ ] Export lock (`quizUnlocked` check) remains in place and is not bypassed
- [ ] Collection export requires the collection owner to be the authenticated user — no shared export across users
- [ ] PDF export continues to work when no notes/highlights exist
- [ ] Adaptive reviewer 422 guard remains in the standard DOCX route — adaptive export is still blocked

---

## Phase 5: AI Companion Engine

**What gets built:**

- DB migration: `ai_companion_events` table
- Store functions: `insertCompanionEvent`, `getCompanionCallCount` (for rate limit check)
- API route: `app/api/companion/route.ts` — streaming endpoint, accepts `{trigger, document_id, topic_index, note_text?, confusion_level?}`
- Context assembly in route: fetch topic JSON from document reviewer, fetch weak_topics from `learning_analytics` (quiz_fail events), assemble bounded prompt, call Anthropic with `stream: true`
- Rate limit enforcement in route: check `ai_companion_events` count for today before calling Anthropic
- Component: `CompanionPanel` — a slide-in panel or inline expansion below a topic card that shows the streaming response. Lives in `components/reviewer/CompanionPanel.tsx`
- Integration points:
  - `ReviewerNotepad` (Phase 2): on save with `confusion_level >= 3`, optionally triggers companion via callback
  - `BoardExamTopicRenderer`: "Get AI Help" button below each topic card → `explicit_help` trigger
  - `DocumentPage`: on section complete → `section_complete` trigger (companion response shown in the completion transition)
  - Quiz completion (weak topic detection): after quiz fail, check if same topic appears in 2+ `quiz_fail` events → mark topic for `repeated_weakness` trigger on next visit

**DB migrations required:**

```sql
-- Migration: 004_ai_companion_events.sql
create table if not exists ai_companion_events (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  document_id      text not null references documents(id) on delete cascade,
  topic_index      integer not null,
  trigger_type     text not null,
  response_type    text not null,
  tokens_input     integer,
  tokens_output    integer,
  created_at       bigint not null
);
create index if not exists idx_companion_events_user_doc on ai_companion_events(user_id, document_id, created_at);
create index if not exists idx_companion_events_user_day on ai_companion_events(user_id, created_at);
```

**Dependencies on prior phases:** Phase 2 (notes, confusion_level signal), Phase 3 (highlights — companion should not trigger on stale-highlight documents without warning), Phase 6 schema (learning_analytics already created in Phase 2; companion reads `quiz_fail` events from it)

**Risk level:** High

**Estimated complexity:** XL

**Risks specific to this phase:**
1. **Cost overrun:** The companion is the only new AI-call system. Without strict rate limit enforcement, a single user could generate hundreds of calls. Rate limit must be enforced server-side before any Anthropic call is made
2. **Streaming in Next.js App Router:** Verify streaming works correctly with the current Vercel deployment configuration. The existing tutor (`app/api/tutor/route.ts`) uses streaming — use the same pattern
3. **Context window budget:** The prompt assembly must be bounded by token count, not assumed. Use a character count proxy (1 token ≈ 4 chars) to trim inputs before sending
4. **Trigger de-duplication:** The `repeated_weakness` trigger must not fire on every page load — only when the condition is newly met. Store a "last triggered at" timestamp in `ai_companion_events` and check it before triggering again

**Zero-regression checklist:**
- [ ] Companion API returns 429 when rate limit exceeded — does not call Anthropic
- [ ] Companion is not triggered during quiz or flashcard sessions — only in the reviewer tab
- [ ] Companion failures are silent to the user (show "AI Help unavailable" — do not break the topic card)
- [ ] Existing tutor (`app/api/tutor/route.ts`) is not modified
- [ ] `section_complete` companion trigger does not delay the progression save — fire companion asynchronously after progression is confirmed saved

---

## Phase 6: Learning Analytics

**What gets built:**

- The `learning_analytics` table already exists (created in Phase 2 migration)
- Add analytics event instrumentation to existing routes (additive — no existing behavior changes):
  - `app/api/progression/route.ts` `complete_section` action → insert `section_complete` event
  - `app/api/progression/route.ts` `complete_quiz` action → insert `quiz_pass` or `quiz_fail` event
  - `app/api/progression/route.ts` `complete_flashcard_challenge` action → insert `flashcard_session_complete` event (minimal data — full session data comes from `flashcard_sessions` table)
  - `app/api/quiz/route.ts` → when remediation is triggered, insert `remediation_triggered` event
- New API route: `app/api/analytics/document/route.ts` — returns computed metrics for a single document (`weak_concepts`, `remediation_frequency`, `avg_section_completion_time`)
- New API route: `app/api/analytics/user/route.ts` — returns user-level metrics (`study_streak`, `total_events_last_7_days`, cross-document `weak_concepts`)
- UI: Expand `app/analytics/page.tsx` with per-document weak concept display and study streak visualization. The existing page shows `quiz_attempts` and `flashcard_sessions` — this phase adds the `learning_analytics` layer alongside without replacing it
- The `analytics_meta` table (existing, single-row per user) is not modified — the new `learning_analytics` table coexists with it

**DB migrations required:** None (table created in Phase 2). Add indexes if not already present:

```sql
-- Migration: 005_analytics_indexes.sql (idempotent)
create index if not exists idx_learning_analytics_event on learning_analytics(event_type, recorded_at desc);
```

**Dependencies on prior phases:** Phase 2 (table created), Phase 5 (companion events feed into analytics aggregate — can run before Phase 5 if companion events table is absent, analytics still works)

**Risk level:** Low

**Estimated complexity:** M

**Zero-regression checklist:**
- [ ] Existing `recordQuizAttempt` and `recordFlashcardSession` functions in `lib/store.ts` are not modified — new analytics inserts are additional calls, not replacements
- [ ] `analytics_meta` single-row constraint is not touched
- [ ] Analytics event insert failures are non-fatal (catch and log — do not throw, do not block the primary progression action)
- [ ] Existing `app/analytics/page.tsx` continues to show `quiz_attempts` and `flashcard_sessions` data unchanged — new data is additive sections

---

## Phase 7: Adaptive Recommendation Engine

**What gets built:**

- Cross-document weak concept aggregation: query `learning_analytics` for `quiz_fail` events grouped by document, extract `event_data.weak_topics`, flatten across documents to find topic clusters that appear in multiple documents
- Collection sequence recommendation: bounded Claude call (max 1,200 tokens input, 200 tokens output) that receives `[{document_title, weak_topics[]}]` and returns a suggested study order with rationale
- UI: "Optimize Study Order" button on collection detail page — shows the recommendation and allows one-click reorder
- Study sequence caching: cache the recommendation in a new `collection_recommendations` table (document_ids[], rationale, generated_at) — re-generate if `generated_at` is more than 7 days old or if collection membership changed

**DB migrations required:**

```sql
-- Migration: 006_collection_recommendations.sql
create table if not exists collection_recommendations (
  id               text primary key,
  collection_id    text not null references study_collections(id) on delete cascade,
  recommended_order text[] not null,            -- document_ids in recommended sequence
  rationale        text,
  generated_at     bigint not null,
  unique(collection_id)
);
```

**Dependencies on prior phases:** Phase 1 (collections), Phase 6 (analytics data with enough history to be meaningful)

**Risk level:** Medium

**Estimated complexity:** L

**Risks specific to this phase:**
1. **Insufficient data:** The recommendation is only meaningful when a user has completed quizzes on multiple documents in the collection. Guard with a minimum threshold: at least 2 documents with at least 1 `quiz_fail` event each, before offering the recommendation button
2. **Stale recommendations:** If the user adds or removes documents from a collection after a recommendation is generated, invalidate the cached recommendation immediately
3. **Cost:** One Claude call per recommendation, max $0.02. Low risk, but cache aggressively — 7-day TTL minimum

**Zero-regression checklist:**
- [ ] Recommendation feature is behind a conditional render — only shown when minimum data threshold is met
- [ ] Applying a recommendation updates `collection_items.position` values without affecting document content, progression, or ownership
- [ ] Recommendation generation failure is non-fatal — show a "Could not generate recommendation" message, collection continues to work normally

---

## Migration Risk Summary

| Migration | Risk | Rollback strategy |
|---|---|---|
| 001: study_collections + collection_items | Low — additive tables | Drop tables (no existing data affected) |
| 002: reviewer_notes + learning_analytics | Low — additive tables | Drop tables |
| 003: reviewer_highlights | Low — additive table | Drop table; revert single-line addition to reviewer API (the `markHighlightsStale` call) |
| 004: ai_companion_events | Low — additive table | Drop table; remove companion API route |
| 005: analytics indexes | None — idempotent | Drop indexes |
| 006: collection_recommendations | Low — additive table | Drop table; remove recommendation button |

The one integration touch point with an existing route is in Phase 3: adding `markHighlightsStale` to `app/api/reviewer/route.ts`. This is a single additive function call — if it fails, the reviewer is already saved and the failure is caught and logged. It does not block reviewer generation.

---

## Feature Flag Strategy

Each phase ships behind a feature flag to allow rollback without a deployment.

Recommended flag naming in a `feature_flags` environment variable or Supabase config table:

| Flag | Phase | Default |
|---|---|---|
| `ENABLE_COLLECTIONS` | 1 | false |
| `ENABLE_NOTES` | 2 | false |
| `ENABLE_HIGHLIGHTS` | 3 | false |
| `ENABLE_ANNOTATED_EXPORT` | 4 | false |
| `ENABLE_COMPANION` | 5 | false |
| `ENABLE_ANALYTICS_DASHBOARD` | 6 | false |
| `ENABLE_RECOMMENDATIONS` | 7 | false |

For a personal platform with a single user, feature flags can be environment variables checked in the API route or page component. This is simpler than a DB-backed flag system.

---

## Progressive Rollout Checklist (per phase)

Before marking any phase complete:

- [ ] Migration applied in Supabase SQL Editor; verify table exists with `\d table_name`
- [ ] New API route returns correct shape for happy path and error cases
- [ ] New store functions tested against live Supabase (not mocked)
- [ ] UI component renders with empty state (no data) without errors
- [ ] UI component renders with populated data correctly
- [ ] Existing reviewer, progression, and quiz flows work identically — no regression on primary study path
- [ ] Feature flag disables the new UI entry point without affecting existing pages
- [ ] DB cascade deletes verified: delete a test document, confirm orphaned rows are cleaned up

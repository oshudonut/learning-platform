# Adaptive Study Intelligence — System Architecture

---

## Overview

This document specifies the architecture for six interconnected systems that add a personalization and intelligence layer on top of the existing mastery-gated learning platform. None of these systems alter the core document → reviewer → progression → quiz lifecycle. They sit as an annotation and intelligence overlay that enriches the study experience without touching the generation or progression state machines.

The guiding principle: **the reviewer owns content generation; these six systems own what the user does with that content afterward.**

---

## Current Platform Boundaries (what exists, what we build on top of)

### What exists (do not modify)

| Layer | Owner | Key files |
|---|---|---|
| Document storage | `lib/store.ts` — `documents` table | reviewer jsonb, quiz jsonb, flashcards jsonb |
| Reviewer generation | `app/api/reviewer/route.ts` | `generateStructured()` + Zod schemas |
| Progression state machine | `app/api/progression/route.ts` | `DocumentProgression`, `upsertProgression()` |
| Mastery gating | `lib/progression.ts` | `PASSING_SCORE=95`, checkpoint thresholds |
| DOCX export | `app/api/export/route.ts` | `docx` package, `buildDocx()` |
| Auth + ownership | Supabase auth, `user_id` on every owned table | `createSupabaseServer()` pattern |

### What the six new systems build on top of

```
[ Reviewer Content (JSON in documents table) ]
         |
         v
[ Annotation Layer: Notes, Highlights ]
         |
         v
[ Analytics Layer: Learning Analytics ]
         |
         v
[ AI Layer: Study Companion Engine ]
         |
         v
[ Organization Layer: Study Collections ]
         |
         v
[ Export Layer: Annotation-Injected Export ]
```

No new system reads or writes to `document_progressions`, `checkpoint_flashcards`, or `remediation_reviewers`. Those tables belong to the progression state machine exclusively.

---

## A. Study Collections System

### Purpose

Let users group multiple documents (reviewers) into an ordered study sequence. A collection is purely organizational — it does not alter reviewer content, progression, or generation behavior.

### Schema

```sql
-- A named, ordered group of documents belonging to a user
create table if not exists study_collections (
  id           text primary key,               -- randomId()
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  color        text not null default 'blue',   -- UI accent color (tailwind color name)
  created_at   bigint not null,
  updated_at   bigint not null
);

create index on study_collections(user_id);

-- Ordered membership: a document can belong to multiple collections
create table if not exists collection_items (
  id              text primary key,            -- randomId()
  collection_id   text not null references study_collections(id) on delete cascade,
  document_id     text not null references documents(id) on delete cascade,
  position        real not null,               -- fractional index for drag-drop reorder
  added_at        bigint not null,
  unique(collection_id, document_id)           -- a doc appears once per collection
);

create index on collection_items(collection_id, position);
create index on collection_items(document_id);
```

### Ordering Strategy

**Fractional indexing** (real/float column named `position`). Rationale:

- Integer positions require renumbering every sibling on a reorder — N writes for N items
- Gap-based integers (multiples of 100) work until gaps collapse after enough moves
- Fractional indexing allows insert-between via midpoint: `(left.position + right.position) / 2` — always exactly one write
- When the gap becomes too small (< 0.0001 between neighbors), a background rebalance renumbers all items in that collection — rare, bounded operation

New items appended to end: `position = max(existing.position) + 1.0`. First item: `position = 1.0`.

### Progression Independence

Each document keeps its own `DocumentProgression`. A collection is a **view** — it groups documents but owns nothing about their mastery state. The collection detail page reads each document's progression separately (batch fetch by document_id array). Deleting a collection does not touch progression records.

### Export Implications

When exporting a collection: fetch each document's reviewer in `position` order, generate individual DOCX sections, and concatenate them into a single multi-section DOCX. This uses the `sections` array in the `docx` Document constructor — each reviewer becomes one `Section`. See Section F for the full injection pipeline that applies per-document annotations before concatenation.

### Future: AI Study Sequence Recommendation

The `collection_items.position` field is the hook. A future "Optimize Sequence" button will call a bounded Claude request (max 1200 tokens) with the collection's topic titles and the user's analytics (weak concepts per document) to suggest a reordered study sequence. The recommendation writes new `position` values. This is deferred to Phase 7.

---

## B. Structured Notes System

### Purpose

Users write freeform notes attached to a specific topic index within a specific document. Notes persist across devices (Supabase, not localStorage), appear inline below each topic card, autosave on keystroke debounce, and inject into exports.

### Schema

```sql
create table if not exists reviewer_notes (
  id                text primary key,              -- randomId()
  user_id           uuid not null references auth.users(id) on delete cascade,
  document_id       text not null references documents(id) on delete cascade,
  topic_index       integer not null,              -- 0-based index into reviewer.topics[]
  note_text         text not null default '',
  ai_tags           jsonb,                         -- future: ["confusion", "mnemonic", "question"]
  confusion_level   integer check (confusion_level between 1 and 5),
  linked_concepts   text[],                        -- future: cross-topic concept links
  created_at        bigint not null,
  updated_at        bigint not null,
  unique(user_id, document_id, topic_index)        -- one note record per topic per user
);

create index on reviewer_notes(user_id, document_id);
create index on reviewer_notes(document_id, topic_index);
```

**Design note on `ai_tags` and `confusion_level`:** These fields are nullable at write time. The companion engine (System D) populates them asynchronously after a `note_saved` event. The schema accommodates this without blocking the initial save path.

**Note on rich text:** The `note_text` column stores plain text at launch. The schema does not constrain the format — switching to Markdown or a JSON-based rich text format (ProseMirror/Tiptap serialization) is a type-preserving migration that adds no new columns. The UI layer handles format detection at render time.

### Storage + Autosave Strategy

- One row per `(user_id, document_id, topic_index)` — upsert pattern using the unique constraint
- Write path: `UPSERT reviewer_notes ... ON CONFLICT (user_id, document_id, topic_index) DO UPDATE SET note_text = ..., updated_at = ...`
- Autosave: 500ms debounce after last keystroke in the note textarea
- Optimistic UI: update local state immediately on keystroke; show "Saved" indicator on API success, "Unsaved" on in-flight
- On load: fetch all notes for a document in a single query (`WHERE user_id = $1 AND document_id = $2`), index into a `Map<topicIndex, Note>` client-side

### Rendering Strategy

Notes render inline below the topic card content in `ReviewerView` / `BoardExamTopicRenderer`. They are:

- **Lazy-loaded** as a batch when the reviewer loads (single DB call for all notes on the document), not per-topic
- **Non-blocking**: if the notes fetch fails, the reviewer renders without annotations — notes are additive
- **Expandable/collapsible**: a "My Notes" disclosure below each topic card, collapsed by default when empty, auto-expanded when content exists

The note textarea sits outside the topic content rendering tree — it does not interfere with highlight range computation (see System C).

### Export Integration

Notes inject into DOCX/PDF exports below their corresponding topic content block. See System F for the injection order and DOCX rendering specifics.

---

## C. Highlighting System

### Architecture Decision

**Selected approach: Semantic offset model** — store `{field_name, item_index, char_start, char_end}`.

**Options evaluated:**

| Option | Verdict |
|---|---|
| DOM range + serialization | Rejected. Range offsets reference DOM positions that change on every re-render. React virtual DOM makes this unreliable. |
| Semantic offset model | **Selected.** Offsets reference positions within a specific string in the reviewer JSON (e.g., `keyPoints[2]`, char 14–31). Survives re-renders as long as the reviewer content has not been regenerated. |
| Hash-based | Considered for stale detection only — adopted as the invalidation mechanism, not the storage model. |

The reviewer JSON is the source of truth. Each `ReviewerTopic` field (`keyPoints`, `mustMemorize`, `quickBreakdown`, `boardTips`, `quickRecall`, `coreIdea`) is a known, stable reference point. An array item is addressed by `(field_name, item_index)` and a character span within that string by `(char_start, char_end)`. As long as the reviewer JSON has not changed, these coordinates are stable across page loads, re-renders, and device switches.

### Schema

```sql
create table if not exists reviewer_highlights (
  id              text primary key,             -- randomId()
  user_id         uuid not null references auth.users(id) on delete cascade,
  document_id     text not null references documents(id) on delete cascade,
  topic_index     integer not null,             -- 0-based index into reviewer.topics[]
  field_name      text not null,                -- "keyPoints" | "mustMemorize" | "quickBreakdown" | "boardTips" | "quickRecall" | "coreIdea"
  item_index      integer,                      -- null for scalar fields (coreIdea), 0-based for array fields
  char_start      integer not null,             -- character offset start (inclusive)
  char_end        integer not null,             -- character offset end (exclusive)
  color_tag       text not null default 'yellow', -- "yellow" | "green" | "blue" | "pink"
  is_stale        boolean not null default false, -- true when reviewer was regenerated after this highlight was created
  created_at      bigint not null
);

create index on reviewer_highlights(user_id, document_id);
create index on reviewer_highlights(document_id, topic_index, field_name);
```

### Renderer Safety

The existing `BoardExamTopicRenderer` renders arrays like `topic.keyPoints.map((pt, i) => ...)`. The highlight renderer wraps each string at the point of rendering:

1. Load highlights for the current document (batch fetch, same as notes)
2. When rendering a field item (e.g., `keyPoints[2]`), check the highlights map for `{field_name: "keyPoints", item_index: 2}`
3. If highlights exist, apply character-span splitting: `text.slice(0, charStart) + [highlighted span] + text.slice(charEnd)`
4. The `SemanticLabel` prefix detection runs on the full string before splitting, so the prefix badge is applied first, then highlighting applies to the remainder text

This rendering is purely presentational — it does not modify the underlying JSON.

**Text selection UX:** User selects text within a rendered field item. On mouseup/touchend, capture the Selection API's `anchorOffset` and `focusOffset` relative to the text node. Map back to `(field_name, item_index, char_start, char_end)` using a data attribute on each rendered text container. Store immediately via API call.

### Stale Highlight Handling

When a reviewer is regenerated (force=true + learningMethod change in `app/api/reviewer/route.ts`), all existing highlights for that document are marked stale:

```sql
UPDATE reviewer_highlights
SET is_stale = true
WHERE document_id = $1 AND user_id = $2;
```

This update runs after the reviewer is saved, within the same API response that resets progression. Stale highlights are:
- Not rendered in the reviewer UI
- Not injected into exports
- Preserved in DB so they can be inspected or manually cleared
- Surfaced in UI as a dismissable warning: "Your highlights were from a previous version of this reviewer."

Stale highlights are **not deleted** on regeneration — only marked. The user can delete them manually or they are cleaned up after 30 days (future: background job).

### Export Integration

Non-stale highlights inject into DOCX with character-level shading using `docx`'s `TextRun` `highlight` property. See System F for injection specifics.

---

## D. AI Study Companion Engine

### Purpose

A contextual, event-triggered AI assistant embedded in the reviewer. This is **not a chatbot** — it does not maintain conversation history. Each companion response is a single stateless call scoped to a specific trigger event and section context.

### Context Pipeline

For every companion event, the prompt is assembled from these layers in order (all are bounded):

```
1. System preamble (shared educator preamble from SYSTEM_PREAMBLE — cached)
2. Current topic JSON (title, coreIdea, keyPoints, mustMemorize — ~300 tokens)
3. User's note for this topic (note_text, confusion_level — ~100 tokens max)
4. Weak topics from last quiz attempt for this document (~50 tokens)
5. Remediation history flag (was remediation triggered for this document?)
6. Event trigger type + companion task instruction (~100 tokens)
```

Total input budget: ~550–650 tokens. Output cap: 300 tokens. Hard-coded in the companion prompt builder.

The companion **does not** receive:
- Full document text (too expensive, not targeted)
- Full reviewer JSON (only the current topic)
- Conversation history (stateless)
- Notes from other topics (scoped to current section)

### Event Triggers

Companion calls are not allowed on every interaction. The following four triggers are the only entry points:

| Trigger | Condition | Response type |
|---|---|---|
| `note_saved` | `confusion_level >= 3` on save | Clarification or mnemonic |
| `explicit_help` | User clicks "Get AI Help" button | Any type — user chooses focus |
| `repeated_weakness` | Same topic appears in `weak_topics` of 2+ quiz attempts for this document | Proactive suggestion (shown inline in topic card) |
| `section_complete` | User marks a section complete | Rapid recall prompt (shown in completion transition) |

**Rate limiting per companion calls:**
- Max 5 `note_saved` companion calls per document per calendar day
- Max 10 `explicit_help` calls per document per calendar day
- `repeated_weakness` is computed on quiz result, not real-time; max 1 per document per quiz attempt
- `section_complete` fires once per section (idempotent — section completion is a one-time event)

Rate limits enforced server-side by querying `ai_companion_events` count for the day before each call.

### Response Categories

The companion response is typed — the API returns a structured response:

```typescript
type CompanionResponse = {
  type: "clarification" | "mnemonic" | "differential" | "rapid_recall" | "weak_area_flag";
  content: string;       // max 300 tokens rendered text
  trigger: CompanionTrigger;
  topicIndex: number;
};
```

Streaming: Yes. The companion API route uses Anthropic streaming (`stream: true`). The client renders the streamed response inline below the topic card via Server-Sent Events or the Anthropic streaming helper.

### Token Budget + Cost Estimate

| Component | Tokens |
|---|---|
| System preamble (cache hit after first call) | ~350 input (cached) |
| Topic context + note + quiz weakness | ~450 input |
| Companion task instruction | ~100 input |
| Response | ~300 output |

Cache hit scenario (same document, same system preamble):
- Cache read: ~350 tokens (essentially free via Anthropic prompt caching)
- Uncached input: ~550 tokens
- Output: ~300 tokens

Cost per event at current pricing ($15/MTok input, $75/MTok output):
- Input: 550 × ($15 / 1,000,000) = ~$0.008
- Output: 300 × ($75 / 1,000,000) = ~$0.023
- **Total per event: ~$0.03 per companion call**

With the 15-call-per-document-per-day cap, maximum cost is $0.45/document/day per user. In practice, average usage will be 2–4 calls/session.

**Do not** call the companion in response to: passive scroll events, tab switches, flashcard flips, or quiz question navigation. These are read-only events with no user confusion signal.

### Storage

```sql
create table if not exists ai_companion_events (
  id               text primary key,          -- randomId()
  user_id          uuid not null references auth.users(id) on delete cascade,
  document_id      text not null references documents(id) on delete cascade,
  topic_index      integer not null,
  trigger_type     text not null,             -- "note_saved" | "explicit_help" | "repeated_weakness" | "section_complete"
  response_type    text not null,             -- "clarification" | "mnemonic" | "differential" | "rapid_recall" | "weak_area_flag"
  tokens_input     integer,
  tokens_output    integer,
  created_at       bigint not null
);

create index on ai_companion_events(user_id, document_id, created_at);
create index on ai_companion_events(user_id, created_at);  -- for daily rate limit queries
```

**Do not store the full prompt or full response text** in this table. The purpose is analytics (trigger frequency, cost tracking, rate limit enforcement) — not response replay. The response is streamed to the client and not persisted.

---

## E. Learning Analytics System

### Purpose

Track fine-grained study events to surface mastery patterns, weak concepts, and study streaks. Feed the companion engine with weakness context. Power a future cross-document recommendation engine.

### Schema

```sql
create table if not exists learning_analytics (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  document_id   text references documents(id) on delete set null,
  event_type    text not null,
  event_data    jsonb not null default '{}',
  recorded_at   bigint not null               -- unix ms timestamp
);

create index on learning_analytics(user_id, recorded_at desc);
create index on learning_analytics(user_id, document_id, event_type);
create index on learning_analytics(event_type, recorded_at desc);
```

### Event Types and `event_data` Shapes

| event_type | event_data fields | When fired |
|---|---|---|
| `section_complete` | `{topic_index, topic_title, time_spent_ms}` | After `complete_section` progression action |
| `quiz_pass` | `{score, difficulty_level, attempt_number}` | After `complete_quiz` with `passed=true` |
| `quiz_fail` | `{score, difficulty_level, weak_topics: string[], attempt_number}` | After `complete_quiz` with `passed=false` |
| `remediation_triggered` | `{weak_topics: string[]}` | When quiz fails and remediation is activated |
| `flashcard_session_complete` | `{cards_studied, avg_quality, duration_ms}` | After flashcard session ends |
| `note_created` | `{topic_index, confusion_level}` | When a new note is saved (not on every keystroke) |
| `companion_triggered` | `{topic_index, trigger_type, response_type, tokens_input, tokens_output}` | After companion responds |
| `collection_study_started` | `{collection_id, document_count}` | When user opens a collection in study mode |

**No event fires on every keystroke, scroll, or hover.** Events are milestone-based.

### Aggregation Strategy

For MVP: **compute at read** (no materialized views, no background jobs). Metrics are derived by querying `learning_analytics` at request time with appropriate indexes.

Metrics and their queries:

**`weak_concepts(user_id, document_id)`**
Query: `SELECT event_data->'weak_topics' FROM learning_analytics WHERE user_id=$1 AND document_id=$2 AND event_type='quiz_fail' ORDER BY recorded_at DESC LIMIT 3` — flatten and deduplicate topic names across the 3 most recent failures.

**`study_streak(user_id)`**
Query: count consecutive days with at least one event in `learning_analytics` where `recorded_at` is within the past N days. Group by `DATE(to_timestamp(recorded_at/1000))` and count backwards from today.

**`remediation_frequency(user_id, document_id)`**
Query: `COUNT(*) FROM learning_analytics WHERE event_type='remediation_triggered' AND document_id=$2`.

**`avg_section_completion_time(user_id, document_id)`**
Query: `AVG((event_data->>'time_spent_ms')::bigint) FROM learning_analytics WHERE event_type='section_complete' AND document_id=$2`.

These queries run in < 50ms on the current data volume (single user, personal platform). Introduce a Supabase Edge Function nightly rollup if query time exceeds 200ms.

### AI Integration

The companion engine queries weak_concepts before each call. The analytics API exposes a `GET /api/analytics/document?id=...` endpoint that returns pre-computed metrics. The companion API calls this endpoint server-side as part of context assembly — this is one DB call, not an AI call.

### Recommendation Engine (future — Phase 7)

Cross-document pattern: identify which topic clusters fail most frequently across all of a user's documents. Feed into collection ordering recommendations. Implementation deferred — the schema supports it because `document_id` is present on every event row, enabling cross-document aggregation.

---

## F. Export Injection Architecture

### Purpose

Produce personalized exports that embed the user's notes and highlights inline with reviewer content, so the exported DOCX/PDF is a complete study artifact.

### Injection Pipeline (per topic)

For each topic in the reviewer, the export builder assembles content in this order:

```
1. Topic heading (existing: heading2(topic.title))
2. Reviewer content (existing: coreIdea, keyPoints, mustMemorize, etc.)
3. Highlights summary (NEW: list of highlighted text spans, grouped by field)
4. User notes (NEW: italicized paragraph block with left border)
5. AI insights (FUTURE: if an ai_companion_events record exists for this topic with a "rapid_recall" response — placeholder until Phase 5+)
```

Steps 3, 4, 5 are injected only if the user has corresponding data. A document with no notes and no highlights produces the same DOCX as today.

### DOCX Implementation

**Notes rendering:**
```
Paragraph: left border (single, blue), spacing before=120, after=120
TextRun: "My Notes: " (bold, color=BLUE, size=18)
TextRun: note_text (italics, size=18, color="444444")
```

**Highlights summary rendering:**
For each field that has at least one non-stale highlight, render a compact list below the field's content:
```
Paragraph: "Highlighted:" (bold, size=16, color=GOLD)
For each highlight: TextRun with highlight="yellow" shading on the highlighted span text
```

The DOCX `TextRun.highlight` property supports: `"yellow"`, `"green"`, `"cyan"`, `"magenta"`, `"red"`, `"darkBlue"`, `"darkCyan"`, `"darkGreen"`, `"darkMagenta"`, `"darkRed"`, `"darkYellow"`, `"darkGray"`, `"lightGray"`, `"white"`. Map the color_tag values accordingly:
- `"yellow"` → `"yellow"`
- `"green"` → `"green"`
- `"blue"` → `"cyan"`
- `"pink"` → `"magenta"`

### PDF Considerations

The existing PDF export (`app/api/export/pdf/route.ts`) uses a different rendering pipeline. For print-safe styling:
- Highlights: use **underline** styling instead of background color (background colors are unreliable in print PDFs)
- Notes: use a left border with lighter weight — same semantic structure as DOCX, different CSS/print rules

Adaptive reviewer types (conceptual, retrieval, memory, relational) currently return a 422 from the DOCX export route. The annotation injection pipeline will be built for standard reviewers first. Adaptive reviewer export support is a separate deferred task.

### Two-Column Compatibility

The standard reviewer renders topics in a two-column grid in the UI (`grid-cols-1 lg:grid-cols-2`). The DOCX export does not use two-column layout — it is a single-column document. Notes inject as full-width paragraphs after the full topic content block, so there is no column boundary issue.

For any future two-column DOCX section, notes must be injected as a `ColumnBreak` to reset to full-width before rendering. This is not required at current scope.

### Collection Export

When exporting a collection (N documents), the export API:
1. Fetches all documents in `position` order
2. For each document: runs the full per-topic injection pipeline (reviewer content + notes + highlights)
3. Concatenates as separate `sections` in a single DOCX `Document`
4. Inserts a page break between documents using `PageBreak` in the `docx` package
5. Returns a single `.docx` file named `{collection_name}_collection.docx`

This requires a new export route: `app/api/export/collection/route.ts`. It reuses the `buildDocx` pipeline with annotation injection, called once per document, then merged.

---

## Layered Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  DocumentPage (tabs: review, quiz, flashcards, tutor)          │
│  CollectionPage  │  AnalyticsDashboard  │  LibraryPage         │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API ROUTES                               │
│  /api/reviewer   /api/progression   /api/quiz   /api/flashcards │
│  ── existing, unchanged ──────────────────────────────────────  │
│  /api/notes          /api/highlights      /api/companion        │
│  /api/collections    /api/analytics       /api/export/collection│
│  ── new ──────────────────────────────────────────────────────  │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      lib/store.ts                               │
│  All DB access — existing + new store functions                 │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE POSTGRES                             │
│                                                                  │
│  EXISTING (do not alter):                                        │
│  documents  │  document_progressions  │  checkpoint_flashcards  │
│  remediation_reviewers  │  quiz_attempts  │  flashcard_sessions  │
│  analytics_meta  │  conversations                               │
│                                                                  │
│  NEW (additive):                                                  │
│  study_collections  │  collection_items                         │
│  reviewer_notes     │  reviewer_highlights                      │
│  ai_companion_events│  learning_analytics                       │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              ANTHROPIC CLAUDE (bounded calls only)              │
│  Existing: reviewer, quiz, flashcards, remediation, tutor       │
│  New: companion (max 15 calls/doc/day, 800 input / 300 output)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cross-System Data Flow

### Note Save → Companion Trigger Flow

```
User types note
  → 500ms debounce
  → POST /api/notes {document_id, topic_index, note_text, confusion_level}
  → UPSERT reviewer_notes
  → INSERT learning_analytics {event_type: "note_created"}
  → if confusion_level >= 3 AND daily_call_count < 5:
      POST /api/companion {trigger: "note_saved", document_id, topic_index}
        → fetch reviewer topic JSON
        → fetch weak_topics from learning_analytics (quiz_fail events)
        → assemble bounded prompt
        → stream response to client
        → INSERT ai_companion_events
```

### Quiz Fail → Repeated Weakness Detection

```
Quiz fails
  → POST /api/progression {action: "complete_quiz", passed: false}
  → INSERT learning_analytics {event_type: "quiz_fail", event_data: {weak_topics}}
  → client checks if same topic in weak_topics appears in 2+ recent quiz_fail events
  → if yes: mark topic card with "Weak Area" indicator
  → on next load of that topic: trigger companion with {trigger: "repeated_weakness"}
```

### Collection Export Flow

```
User clicks "Export Collection"
  → GET /api/export/collection?id={collection_id}
  → fetch collection_items in position order
  → for each document:
      fetch document + reviewer
      fetch reviewer_notes WHERE document_id = ?
      fetch reviewer_highlights WHERE document_id = ? AND is_stale = false
      build annotated DOCX section
  → merge sections into single Document
  → return .docx binary
```

---

## DB Schema Summary (all new tables)

| Table | Purpose | Owner column |
|---|---|---|
| `study_collections` | Named study groups | `user_id` |
| `collection_items` | Doc-to-collection membership + position | via `collection_id → study_collections.user_id` |
| `reviewer_notes` | Per-topic user notes | `user_id` |
| `reviewer_highlights` | Per-field text span highlights | `user_id` |
| `ai_companion_events` | Companion call log (analytics, rate limiting) | `user_id` |
| `learning_analytics` | Fine-grained study event log | `user_id` |

All 6 new tables are additive. No existing table schema changes.

---

## Security + Ownership Model

All new tables follow the established pattern from `lib/store.ts`:

1. **Authentication:** Every API route calls `createSupabaseServer()` and checks `supabase.auth.getUser()` — returning 401 if no user
2. **Ownership enforcement:** Every query includes `.eq("user_id", user.id)` — users cannot read or write another user's annotations
3. **Document ownership cascade:** Notes and highlights reference a `document_id`. Before writing, the API confirms `user_id` owns the document (same pattern as `getProgression` which checks document ownership first)
4. **Collection item access:** `collection_items` has no `user_id` column. Access is through the parent `study_collections` — only fetch items where `collection_id IN (SELECT id FROM study_collections WHERE user_id = $1)`
5. **Cascade deletes:** If a document is deleted, its notes, highlights, companion events, and analytics rows cascade delete via `ON DELETE CASCADE`. If a collection is deleted, its items cascade delete but the documents themselves are unaffected
6. **RLS (recommended):** Add Row Level Security policies to all new tables using `auth.uid() = user_id` for the `study_collections`, `reviewer_notes`, `reviewer_highlights`, `ai_companion_events`, and `learning_analytics` tables. For `collection_items`, RLS policy should check ownership through the parent collection

The companion API route must **never** return data from another user's notes or highlights in the context payload — this is enforced by always scoping queries to the authenticated `user.id`.

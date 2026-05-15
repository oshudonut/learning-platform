# Adaptive Methodology Contracts

Established by the `adaptive-methodology-team` session (2026-05-15). These are the agreed interfaces across DB, AI, and frontend layers for the `learningMethod` feature.

---

## Data Contract

### Source of truth: `document_progressions.learning_method`
- Type: `LearningMethod` (see `lib/types.ts`)
- Read by: all API routes via `getProgression(documentId, userId)`
- Written by: upload flow → `ReviewerSetupModal` → `/api/folders` or progression upsert
- Must be preserved across `rebuildSectionStatuses()` — **this was a live bug, now patched**

### `LearningMethod` enum (canonical — `lib/types.ts`)
```
feynman | active_recall | spaced_repetition | blurting | mind_maps |
mnemonic | interleaving | elaboration | sq3r | pq4r | leitner | pomodoro | multisensory
```
13 values. Adding a new method requires:
1. `lib/types.ts` — add to union
2. `lib/learning-methods.ts` — add to `METHOD_CONFIG` and `SURFACE_HINT_OVERRIDES`
3. `lib/prompts.ts` — add to `METHOD_FLASHCARD_INSTRUCTIONS`, `METHOD_TUTOR_ADDENDUM`, `METHOD_QUIZ_INSTRUCTIONS`

---

## API Route Contract

Every generation route must:
1. Authenticate user (`createClient`, check `user`)
2. Call `getProgression(documentId, user.id)` to read `learningMethod`
3. Pass `progression?.learningMethod ?? undefined` to the prompt builder
4. If progression is null (no mastery state yet), fall through to method-agnostic baseline — **never throw**

| Route | Prompt builder called |
|---|---|
| `app/api/flashcards/route.ts` | `buildFlashcardTask(method?)` |
| `app/api/checkpoint-flashcards/route.ts` | `buildCheckpointFlashcardTask(topicTitles, method?)` |
| `app/api/quiz/route.ts` | `buildQuizTask({ difficultyLevel, weakTopics, learningMethod? })` |
| `app/api/tutor/route.ts` | `TUTOR_WITH_CONTEXT(context, title, method?)` |
| `app/api/remediation/route.ts` | `getRemediationConfig()` + `buildRemediationPreamble(weakTopics, schemaFamily?)` |

---

## Prompt Builder Contract

All prompt builders are **additive** — method instruction is prepended to the base task string. `method=undefined` always returns the unmodified baseline prompt. Zero regression risk for documents without a `learningMethod`.

```ts
buildFlashcardTask(method?: LearningMethod): string
buildCheckpointFlashcardTask(topicTitles: string[], method?: LearningMethod): string
buildQuizTask(opts: { difficultyLevel, weakTopics, questionCount?, learningMethod? }): string
buildTutorSystemPrompt(method?: LearningMethod): string
TUTOR_WITH_CONTEXT(context: string, title: string, method?: LearningMethod): string
buildRemediationPreamble(weakTopics: string[], schemaFamily?: ReviewerSchemaType): string
getRemediationConfig(): ReturnType<typeof getMethodologyConfig>
```

**Checkpoint constraint priority**: topic-coverage constraint (which sections, card count) takes absolute priority over method framing. Method style is applied to front/back content only, never to card selection.

---

## Frontend Contract

### `lib/learning-methods.ts` — single source of truth for display
```ts
METHOD_CONFIG: Record<LearningMethod, MethodConfig>   // badge, accent, labels, reviewer hint
getMethodHint(method, surface): string | null          // surface = reviewer|quiz|flashcard|tutor
MethodBadge({ method, className?, label? }): JSX       // shared pill component
SURFACE_HINT_OVERRIDES                                 // quiz/flashcard/tutor per-method hints
```

### Component contract
All 4 study surfaces accept `learningMethod?: LearningMethod | null` as a prop:
- `FlashcardStudy` — renders `<MethodBadge />` in card counter row
- `QuizEngine` — renders `<MethodBadge />` in quiz header
- `TutorChat` — renders `<MethodBadge label="Study approach: [method]" />`
- `ReviewerView` — renders badge + uses `METHOD_CONFIG` for section labels (pre-existing)

`method=null` / `method=undefined` on any component renders nothing — no empty state needed.

### `ReviewerSetupModal`
Expanded to all 13 methods. User selects methodology at upload time; selection is persisted to `document_progressions.learning_method` on confirm.

---

## Pomodoro Exception
Pomodoro is a time-management technique, not a content technique. It has:
- A tutor persona (suggests study breaks at concept boundaries)
- Reviewer-surface hint (set a 25-min timer)
- **No** flashcard instruction (`METHOD_FLASHCARD_INSTRUCTIONS.pomodoro = ""`)
- **No** quiz mix instruction (falls through to default)
- **No** quiz/flashcard `SURFACE_HINT_OVERRIDES` entries

`getMethodHint(method, "quiz")` and `getMethodHint(method, "flashcard")` return `null` for Pomodoro intentionally.

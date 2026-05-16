# Reviewer Pipeline — System Documentation

Branch: `feature/board-review-renderer`  
Captured: 2026-05-16 (no changes made — read-only audit)

---

## 1. Reviewer Schema (Source of Truth: `lib/types.ts`)

### Standard reviewer (`ReviewerSchema`)

Used by `pomodoro` method and as the default when no method is selected.
Also the only schema type that supports DOCX export.

```
ReviewerSchema
  title: string
  summary: string
  topics: ReviewerTopic[]     (min 3, max 6)
  globalMustMemorize: string[]
  mnemonics: { concept, aid }[]

ReviewerTopicSchema
  title: string
  coreIdea: string
  keyPoints: string[]
  quickBreakdown: string[]
  mustMemorize: string[]
  confusedWith?: { item, distinction }[]   ← optional at Zod level
  boardTips: string[]
  quickRecall: string[]
```

### Adaptive reviewer schemas (non-standard)

| Schema | Type literal | Methods |
|--------|-------------|---------|
| `ConceptualReviewerSchema` | `"conceptual"` | feynman, elaboration, multisensory |
| `RetrievalReviewerSchema`  | `"retrieval"`  | active_recall, blurting, sq3r, pq4r |
| `MemoryReviewerSchema`     | `"memory"`     | spaced_repetition, mnemonic, leitner |
| `RelationalReviewerSchema` | `"relational"` | mind_maps, interleaving |

Adaptive reviewers have a `type` discriminant field. Standard reviewer has no `type` field.
`AnyReviewer` union covers all five. `ReviewerSchemaType` = `"standard" | "conceptual" | "retrieval" | "memory" | "relational"`.

### Schema routing

`METHOD_SCHEMA_MAP` (in `lib/types.ts`) maps every `LearningMethod` → `ReviewerSchemaType`.
`getMethodologyConfig()` (in `lib/prompts.ts`) returns `{ taskInstruction, systemPreamble, schemaType }` for a given `(method, mode)` pair.

---

## 2. Generation Flow (`POST /api/reviewer`)

Entry: `app/api/reviewer/route.ts`

```
Client POST { id, force?, learningMethod?, studyMode? }
  │
  ├─ Auth check (Supabase session)
  ├─ getDocument(id, user.id)                → doc row from Supabase
  │
  ├─ Cache check (if !force && doc.reviewer) → return cached, skip generation
  ├─ Hash check  (if !force && hash matches) → return cached
  │
  ├─ compressDocumentForReview(doc.text)     → lib/claude.ts
  │
  ├─ Resolve method/mode
  │     If not in request → fall back to progression.learningMethod / studyMode
  │
  ├─ getMethodologyConfig(method, mode)
  │     → taskInstruction, systemPreamble, schemaType
  │
  ├─ SCHEMA_MAP[schemaType]                  → Zod schema for validation
  │
  ├─ generateStructured({ schema, systemPreamble, documentText, ... })
  │     → lib/claude.ts → Anthropic API (claude-opus-4-5)
  │     → Zod-validated parsed object
  │
  ├─ updateDocument(id, user.id, { reviewer: parsed, contentHash })
  │
  └─ if (force && learningMethod):           ← Progression reset gate
        buildInitialProgression(id, topicCount)
        carry forward: learningMethod, studyMode, masteredAt, createdAt
        upsertProgression(fresh)
        freshProgression = fresh              ← returned in response
        progressionReset = true

Response: { reviewer, cached, schemaType, progressionReset, freshProgression?, usage }
```

**Key constraint**: Progression is only reset when `force=true AND learningMethod` is in the request. Error-retry calls (`force=true`, no method) do NOT reset progression.

---

## 3. Progression Flow (`POST /api/progression`)

Entry: `app/api/progression/route.ts`  
Helper library: `lib/progression.ts`

### Actions

| Action | Effect |
|--------|--------|
| `get` | Fetch or create progression. If section count mismatches reviewer topic count, call `rebuildSectionStatuses`. |
| `complete_section` | Mark section done, advance `currentSectionIndex`, check quiz unlock eligibility. |
| `complete_checkpoint` | Mark checkpoint done, check quiz unlock. |
| `complete_flashcard_challenge` | Set `flashcardChallengeCompleted: true`, check quiz unlock. |
| `complete_quiz` | Pass → set `masteredAt`, escalate difficulty. Fail → `remediationActive: true`, lock quiz. |
| `complete_remediation` | Clear remediation, re-unlock quiz. |
| `save_learning_profile` | Update `learningMethod` + `studyMode` only. ALL completion state preserved. |

### Quiz unlock gate (`isQuizUnlockEligible`)

```
allSections.every(completed) && flashcardChallengeCompleted
```

### `rebuildSectionStatuses`

Called from `get` action when `progression.sectionStatuses.length !== doc.reviewer.topics.length`.
PRESERVES: `quizUnlocked`, `masteredAt`, `currentDifficultyLevel`, `remediationActive`,
`remediationCompletedAt`, `currentSectionIndex`, `flashcardChallengeCompleted`, `createdAt`,
`learningMethod`, `studyMode`.

⚠️ This means if a reset progression (all false) is read via `get` immediately after upsert,
and the topic count differs from sectionStatuses.length, the old flags survive.
See: `docs/debugging/reviewer-regeneration-fix.md` for the fix applied.

### Progression DB schema

Table: `document_progressions`  
Primary key: `document_id` (text)  
No `user_id` on this table — ownership checked via `documents` table join in `getDocument`.

---

## 4. Regeneration Flow

```
User clicks "Regenerate"
  → setReviewer({ status: "idle" })        ← client state only
  → setProgression(null)                   ← client state only
  → UI shows MethodSelection

User picks method
  → handleMethodSelect(method, mode)
      1. POST /api/progression { action: "save_learning_profile" }
         → DB: update method/mode, KEEP all completion state
      2. loadReviewer(true, method, mode)
           POST /api/reviewer { id, force: true, learningMethod, studyMode }
           → Generates new reviewer
           → Resets progression in DB (upsertProgression(fresh))
           → Returns { reviewer, progressionReset: true, freshProgression }
           → Client: setReviewer(success), setProgression(freshProgression)
              ← Uses freshProgression directly — NO server re-fetch on reset
```

The `freshProgression` short-circuit (implemented in fix) prevents `rebuildSectionStatuses`
from restoring old completed state during the progression GET re-fetch.

---

## 5. Export Flow (`GET /api/export`)

Entry: `app/api/export/route.ts`

```
GET /api/export?id=<documentId>
  │
  ├─ Auth check
  ├─ getDocument(id, user.id)
  ├─ getProgression(id, user.id)
  │
  ├─ Gate: progression.quizUnlocked === false → 403
  │
  ├─ Type check: reviewer must have { topics, summary, globalMustMemorize }
  │     Adaptive reviewers fail this check → 422
  │     Only STANDARD reviewer can be exported
  │
  └─ buildDocx(doc, reviewer as Reviewer) → Packer.toBuffer() → DOCX response
```

`buildDocx` renders: title, summary, per-topic (Core Idea, Key Points, Quick Breakdown,
Must Memorize, Don't Confuse, Board Tips, Quick Recall), Global Must Memorize, Mnemonics.

**Export lock**: Server-enforced at 403. UI also hides the button unless `progression.quizUnlocked`.

---

## 6. Review Rendering Flow

Entry: `components/reviewer/ReviewerView.tsx` (exported from here, consumed in `app/document/[id]/page.tsx`)

### Dispatch logic

```tsx
if ("type" in reviewer) {
  // Adaptive: dispatch to method-specific view
  reviewer.type === "conceptual" → <ConceptualReviewerView>
  reviewer.type === "retrieval"  → <RetrievalReviewerView>
  reviewer.type === "memory"     → <MemoryReviewerView>
  reviewer.type === "relational" → <RelationalReviewerView>
}

// Standard (no type field):
const standardReviewer = reviewer as Reviewer;
```

### Standard renderer state machine

```
allComplete && !flashcardChallengeCompleted → <ReviewerCompleteScreen> (CTA: Start Flashcard Challenge)
allComplete && flashcardChallengeCompleted  → "All Done" static screen
otherwise                                   → Section view (topic at currentIdx)
```

`currentIdx = Math.min(Math.max(localIdx, serverIdx), total - 1)`
`localIdx` is component-local state (advances optimistically on mark-complete).
`serverIdx = progression.currentSectionIndex` (from server).

### Section content renderer

`<BoardExamTopicRenderer topic={topic} isLastSection globalMustMemorize mnemonics />`  
Defined in: `components/reviewer/board-exam/BoardExamTopicRenderer.tsx`

Uses these primitives (all in `components/reviewer/primitives/`):
- `BoardExamCallout` — themed callout box (amber/blue/emerald/red/muted variants)
- `BoardTipStrip` — parses `[TRAP]` / `[PEARL]` / `[TRICK]` prefix tags from boardTips strings
- `DiffTable` — two-column red/green comparison grid for confusedWith
- `MnemonicCard` — concept + aid card
- `formatBoardText` — inline rich text: styles `→ ↑ ↓` arrows and numeric values

### Layout within a section card

```
1. Core Idea          amber left-border banner (full width)
2. Two-column grid:
     LEFT:  Key Points (muted callout) + Quick Breakdown (muted callout)
     RIGHT: Must Memorize (amber callout) + Board Tips (BoardTipStrip)
3. Don't Confuse      DiffTable (full width, shown when confusedWith present)
4. Quick Recall       emerald callout (full width)
5. [last section only] Global Must Memorize (amber callout) + Mnemonics (MnemonicCard grid)
```

---

## 7. Key Entry Points

| Concern | File |
|---------|------|
| Reviewer generation API | `app/api/reviewer/route.ts` |
| Progression state machine | `app/api/progression/route.ts` |
| DOCX export | `app/api/export/route.ts` |
| PDF export | `app/api/export/pdf/route.ts` |
| Reviewer rendering root | `components/reviewer/ReviewerView.tsx` |
| Board-exam section renderer | `components/reviewer/board-exam/BoardExamTopicRenderer.tsx` |
| Primitive components | `components/reviewer/primitives/` |
| Adaptive views | `components/reviewer/views/` |
| All Zod schemas + TS types | `lib/types.ts` |
| Progression helpers | `lib/progression.ts` |
| DB operations | `lib/store.ts` |
| Claude API wrappers | `lib/claude.ts` |
| Prompts | `lib/prompts.ts` |

---

## 8. What Is Safe to Touch on This Branch

**Safe — contained to renderer only:**
- `components/reviewer/board-exam/BoardExamTopicRenderer.tsx`
- `components/reviewer/primitives/*`
- New files under `components/reviewer/board-exam/`

**Read-only for now (per task requirements):**
- `app/api/progression/route.ts` — no progression logic changes
- `app/api/reviewer/route.ts` — generation unchanged
- `app/api/export/route.ts` — export unchanged
- `components/reviewer/views/*` — adaptive views untouched
- `lib/types.ts` — schema unchanged (no new fields)
- `lib/prompts.ts` — prompt unchanged
- All flashcard, quiz, remediation code

**Allowed — rendering improvements only:**
- Modify `ReviewerView.tsx` to improve the board-exam section layout
- Add new components under `components/reviewer/board-exam/`
- Add new primitives under `components/reviewer/primitives/`

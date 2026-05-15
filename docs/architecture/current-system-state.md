# Current System State

## Stack
- **Runtime**: Next.js 14 App Router, TypeScript, TailwindCSS
- **Backend**: Supabase Postgres (service-key client — bypasses RLS; isolation enforced via explicit `.eq("user_id", userId)` in store functions)
- **AI**: Anthropic SDK, model `claude-opus-4-5` (`MODEL` constant in `lib/claude.ts`)
- **Auth**: Supabase Auth, email-only (Google OAuth removed)
- **Deployment**: Vercel (`https://learning-platform-tau-topaz.vercel.app`)

## Database Tables
| Table | Purpose | user_id? |
|---|---|---|
| `documents` | Uploaded files, extracted text, reviewer/quiz/flashcard JSON | ✅ NOT NULL (after `final_isolation_hardening.sql`) |
| `document_progressions` | Mastery state machine per document | ✅ column added via `security_hardening_migration.sql` |
| `quiz_attempts` | Quiz results per user | ✅ NOT NULL |
| `flashcard_sessions` | SM-2 session records | ✅ NOT NULL |
| `flashcard_review_states` | SM-2 interval state per card | no user_id — scoped via docId |
| `conversations` | Tutor chat history | ✅ column added via `security_hardening_migration.sql` |
| `analytics_meta` | Aggregated study minutes/stats | ✅ (nullable) |
| `folders` | Document organization | ✅ |
| `checkpoint_flashcards` | Checkpoint flashcard sets | via docId |
| `remediation_reviewers` | Remediation reviewer content | via docId |

## All DB Access
All queries go through `lib/store.ts`. The Supabase client in `lib/supabase.ts` uses `SUPABASE_SECRET_KEY` (service key), which bypasses RLS entirely. RLS policies are defense-in-depth only — primary isolation is enforced by explicit `userId` params and `.eq("user_id", userId)` guards on every store function.

## Mastery-Gated Progression Flow
```
Upload → Reviewer (sections) → Read sections → every 20% triggers Checkpoint (5–8 flashcards)
→ 100% sections + all 5 checkpoints → Quiz unlocks
→ Quiz: 95% pass threshold (PASSING_SCORE in lib/progression.ts)
→ Fail → Remediation reviewer → retry
→ Pass → Mastered, DOCX export unlocks, difficulty escalates
```

Difficulty levels: `beginner → intermediate → advanced → board_exam → extreme_recall`

## Learning Methodology — Post-Session State
`learningMethod` from `document_progressions` is now threaded through every generation pipeline:

| Surface | Reads `learningMethod` | Prompt builder |
|---|---|---|
| Reviewer | ✅ (was already wired) | `getMethodologyConfig()` in `lib/prompts.ts` |
| Flashcards | ✅ | `buildFlashcardTask(method?)` |
| Checkpoint flashcards | ✅ | `buildCheckpointFlashcardTask(topicTitles, method?)` |
| Quiz | ✅ | `buildQuizTask({ ..., learningMethod? })` |
| Tutor | ✅ | `buildTutorSystemPrompt(method?)` via `TUTOR_WITH_CONTEXT` |
| Remediation | ✅ | `getRemediationConfig()` |

13 supported methods: `feynman`, `active_recall`, `spaced_repetition`, `blurting`, `mind_maps`, `mnemonic`, `interleaving`, `elaboration`, `sq3r`, `pq4r`, `leitner`, `pomodoro`, `multisensory`

## Key Shared Libraries
| File | Role |
|---|---|
| `lib/store.ts` | All Supabase operations |
| `lib/types.ts` | TypeScript types + Zod schemas |
| `lib/claude.ts` | Anthropic SDK wrappers (`generateStructured`, `streamTutorResponse`, `ocrPdfWithVision`) |
| `lib/prompts.ts` | All AI prompt builders |
| `lib/progression.ts` | Mastery state machine helpers, `PASSING_SCORE=95` |
| `lib/learning-methods.ts` | Methodology config, `MethodBadge`, `getMethodHint`, `SURFACE_HINT_OVERRIDES` |

## Layout
All pages use `<AppShell>` from `components/layout/AppShell.tsx`. Never add `<Sidebar />` directly to a page.

# Implementation Status

Last updated: 2026-05-15  
Last commit: `a2c12a4` — Stage 1 security hardening  
Working tree: 20 modified/untracked files, **not yet committed**

---

## Committed and Deployed
| Commit | What |
|---|---|
| `a9e1aeb` | Per-user isolation, folders, reviewer setup flow — **live on Vercel** |
| `a2c12a4` | Stage 1 security hardening — `userId` enforcement on store functions, `security_hardening_migration.sql` created |

## In Working Tree (TypeScript clean, not committed)

### Bug fix
- `app/api/progression/route.ts` — `rebuildSectionStatuses` now preserves `learningMethod` + `studyMode` (was silently wiping on every rebuild)

### New file
- `lib/learning-methods.ts` — shared methodology config, `MethodBadge`, `getMethodHint`, `SURFACE_HINT_OVERRIDES` (13 methods, all surfaces)

### Prompt layer
- `lib/prompts.ts` — method-aware builders for flashcard, quiz, checkpoint, tutor, remediation

### API routes (all 4 generation surfaces wired)
- `app/api/flashcards/route.ts`
- `app/api/checkpoint-flashcards/route.ts`
- `app/api/quiz/route.ts`
- `app/api/tutor/route.ts`
- `app/api/remediation/route.ts`

### Frontend
- `components/flashcard/FlashcardStudy.tsx` — `learningMethod` prop + `<MethodBadge />`
- `components/quiz/QuizEngine.tsx` — `learningMethod` prop + `<MethodBadge />`
- `components/tutor/TutorChat.tsx` — `learningMethod` prop + `<MethodBadge />`
- `components/reviewer/ReviewerView.tsx` — cleanup + `learningMethod` threading
- `components/upload/ReviewerSetupModal.tsx` — expanded to 13 methods
- `app/document/[id]/page.tsx` — threads `learningMethod` prop to study components

### Also in working tree (pre-existing, unrelated to methodology feature)
- `app/library/page.tsx`, `app/page.tsx`, `components/library/DocumentCard.tsx`, `components/library/FolderCard.tsx`, `app/auth/callback/route.ts`

### New migration (not yet run in Supabase)
- `supabase/final_isolation_hardening.sql` — closes `OR user_id IS NULL` RLS escape hatch, adds `NOT NULL` constraints (see `docs/handoffs/unfinished-items.md`)
- `supabase/security_hardening_migration.sql` — adds `user_id` to `conversations` + `document_progressions`, missing indexes (also not yet run)

## Immediate Next Action
```bash
npx tsc --noEmit   # already verified clean
git add <files>
git commit
# Then run both SQL migrations in Supabase SQL Editor
```

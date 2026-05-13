# Second Brain — AI Learning Platform

Next.js 14 App Router + Supabase + Claude AI. Personal study platform with mastery-gated progression.

## Stack
- **Frontend**: Next.js 14 App Router, TailwindCSS, Framer Motion, Lucide icons
- **Backend**: Supabase Postgres (no file I/O — Vercel has ephemeral filesystem)
- **AI**: Anthropic SDK (`claude-opus-4-5` model), RAG with chunked text
- **Packages**: `docx` (export), `mammoth` (DOCX input), `pdfjs-dist` (PDF parsing)

## Environment Variables (Vercel + local `.env.local`)
```
SUPABASE_URL=https://tawysubhylucwzpkwokn.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
ANTHROPIC_API_KEY=sk-ant-...
```

## Database (Supabase)
Run pending migrations in Supabase SQL Editor if tables are missing:
- `supabase/schema.sql` — core tables (documents, conversations, quiz_attempts, flashcard_sessions, analytics_meta)
- `supabase/progression_schema.sql` — mastery tables (document_progressions, checkpoint_flashcards, remediation_reviewers + ALTER quiz_attempts)

All DB access goes through `lib/store.ts`. Never use the filesystem for persistence.

## Key Architecture

### Mastery-Gated Progression
Documents have a `DocumentProgression` (see `lib/types.ts`). The flow:
1. Reviewer generates sections → user reads each section → marks complete
2. Every 20% of sections triggers a **checkpoint** (5-8 flashcards, must complete all)
3. After 100% sections + all 5 checkpoints → quiz unlocks
4. Quiz requires **95% pass** (`PASSING_SCORE` in `lib/progression.ts`)
5. Fail → remediation reviewer generated for weak topics → retry
6. Pass → mastered, DOCX export unlocks, difficulty escalates for next attempt

### Difficulty Levels
`beginner → intermediate → advanced → board_exam → extreme_recall`

### Layout System
- `SidebarProvider` in `app/layout.tsx` wraps everything
- All pages use `<AppShell>` from `components/layout/AppShell.tsx` — handles sidebar margin
- Sidebar collapse state persisted to localStorage
- Never add `<Sidebar />` directly to a page — always use `AppShell`

## File Map

```
app/
  layout.tsx              — root layout, SidebarProvider
  page.tsx                — home (upload zone + recent docs)
  library/page.tsx        — all documents
  analytics/page.tsx      — quiz/flashcard stats
  flashcards/page.tsx     — flashcard decks list
  tutor/page.tsx          — AI tutor chat
  document/[id]/page.tsx  — main document view (review/quiz/flashcards/tutor tabs)
  api/
    upload/route.ts       — file upload (PDF, DOCX, PNG/JPG/WEBP + OCR)
    reviewer/route.ts     — generate/fetch reviewer
    quiz/route.ts         — generate/fetch quiz (locked until progression unlocked)
    quiz/grade-open/      — grade identification/fill-in-blank answers via Claude
    flashcards/route.ts   — generate/fetch flashcards
    flashcard-states/     — SM-2 review state persistence
    progression/route.ts  — mastery progression state machine
    checkpoint-flashcards/— generate checkpoint flashcard sets
    remediation/route.ts  — generate/complete remediation reviewer
    export/route.ts       — DOCX export (locked until quizUnlocked)
    tutor/route.ts        — streaming AI tutor
    library/route.ts      — list/delete documents
    analytics/route.ts    — study analytics
    document/route.ts     — single document fetch

lib/
  store.ts        — all Supabase DB operations
  types.ts        — all TypeScript types + Zod schemas
  claude.ts       — Anthropic SDK wrappers (generateStructured, ocrPdfWithVision, etc.)
  prompts.ts      — all AI prompts (reviewer, quiz, flashcards, checkpoint, remediation)
  progression.ts  — progression helpers (PASSING_SCORE=95, getCheckpointThreshold, etc.)
  pdf.ts          — PDF text extraction
  utils.ts        — randomId, formatDistanceToNow, cn, etc.

components/
  layout/
    Sidebar.tsx         — collapsible sidebar with nav
    SidebarContext.tsx   — collapsed state context + localStorage
    AppShell.tsx         — layout wrapper (use this in every page)
  reviewer/
    ReviewerView.tsx         — section-by-section reviewer with progress
    CheckpointChallenge.tsx  — checkpoint flashcard challenge
  quiz/
    QuizEngine.tsx      — handles MC, T/F, identification, fill-in-blank
  flashcard/
    FlashCard.tsx       — flip card (presentational)
    FlashcardStudy.tsx  — SM-2 study session
  tutor/
    TutorChat.tsx       — RAG-powered chat UI
  upload-zone.tsx       — multi-file queue upload with OCR toggle
  ui/                   — shadcn-style primitives (Button, Badge, Progress, etc.)
```

## Conventions
- `"use client"` only where hooks/events are needed; prefer server components
- Supabase client: `lib/supabase.ts` — uses secret key, server-only
- AI model: `claude-opus-4-5` (defined as `MODEL` constant in `lib/claude.ts`)
- All AI content generated via `generateStructured()` with Zod validation
- Quiz lock enforced server-side (423 status) — not just in UI
- DOCX export locked server-side (403) until `quizUnlocked`

## Pending Work
- [ ] Workspaces: group documents into study workspaces (needs `workspaces` table, `workspace_id` on documents, Library grouping UI)
- [ ] Verify deployment on Vercel is healthy after recent Supabase migration
- [ ] Rotate ANTHROPIC_API_KEY (was accidentally exposed in a prior session)

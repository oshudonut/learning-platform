# Session Handoff — 2026-05-15

## Goal

Transform the platform from a shared reviewer upload system into a fully private, user-isolated AI academic workspace with:

1. Email-only auth (Google OAuth temporarily removed)
2. Per-user isolated libraries (no user ever sees another user's data)
3. Folder-based document organization
4. Pre-generation reviewer setup flow (name + folder + learning method before generating)
5. Library redesigned as a folder-first workspace (Notion/Obsidian-style)

---

## What's Done This Session

### Auth cleanup — COMPLETE
- `app/auth/login/page.tsx` — Google OAuth button, `handleGoogleLogin`, `oauthLoading` state, Chrome icon, and divider all removed
- `app/auth/signup/page.tsx` — same removals

### Type system — COMPLETE
- `lib/types.ts` — `Folder` type added (id, userId, name, color, createdAt, updatedAt)
- `lib/types.ts` — `Document` type now has `folderId?: string | null`

### Store layer — PARTIALLY DONE
- `lib/store.ts` — `toRow` now includes `folder_id: doc.folderId ?? null`
- `lib/store.ts` — `fromRow` now maps `folder_id` → `folderId`
- Everything else in the store layer is NOT yet updated (see below)

### Database migration file — COMPLETE (not yet run)
- `supabase/folders_and_isolation_migration.sql` — created, ready to run in Supabase SQL Editor
- Contains: folders table, RLS policies, `folder_id` on documents, `user_id` on quiz_attempts and flashcard_sessions, analytics_meta per-user migration

### ReviewerSetupModal — COMPLETE (not yet wired up)
- `components/upload/ReviewerSetupModal.tsx` — full component built
- Shows: reviewer name input, folder dropdown with inline "create folder" flow, 6-card learning method picker, "Generate" / "Skip" buttons

---

## What Is NOT Done

### Store layer — remaining changes needed in `lib/store.ts`
- `listDocuments` — still has `userId?: string` (optional). Must be changed to required and always filter `.eq("user_id", userId)`. Also needs `folder_id` in SELECT clause and `folderId` in returned objects.
- `deleteDocument` — must accept `userId: string` and add `.eq("user_id", userId)` to the query
- `recordQuizAttempt` — needs `userId: string` param, `user_id: userId` in insert, and replace old meta block with `await _updateAnalyticsMeta(userId, 5)`
- `recordFlashcardSession` — same pattern
- `getAnalytics` — needs `userId: string` param, per-user filtering on all three queries
- Private helper `_updateAnalyticsMeta(userId, studyMinutes)` — not yet added
- **Folder CRUD functions** — not yet added: `createFolder`, `listFolders`, `updateFolder`, `deleteFolder`, `moveDocumentToFolder`, `renameDocument`

### API routes — all need updating
- `app/api/library/route.ts` — add auth check, pass `user.id` to `listDocuments` and `deleteDocument`
- `app/api/folders/route.ts` — does not exist yet; must be created
- `app/api/analytics/route.ts` — add auth, pass userId to analytics functions
- `app/api/upload/route.ts` — accept `folderId` + `reviewerName` from form data; use custom name as title; pass folderId to saveDocument

### Home page
- `app/page.tsx` — `RecentDocuments` server component calls `listDocuments()` with no userId. Must add Supabase auth call and pass `user.id` (or return null if unauthenticated).

### Frontend components — not yet created
- `components/library/FolderCard.tsx` — folder card with colored icon, doc count, inline rename, delete confirm
- `components/library/DocumentCard.tsx` — document card with three-dot menu (open, rename, move to folder, delete)
- `app/library/page.tsx` — full rewrite needed: folder-first layout, active folder drill-down, breadcrumb navigation, parallel fetch from /api/library and /api/folders

### UploadZone — not yet wired to modal
- `components/upload-zone.tsx` — needs to be modified to show `ReviewerSetupModal` after upload completes instead of immediately navigating to the document page

---

## Files Actively In Progress (partially modified, need completion)

| File | Status |
|------|--------|
| `lib/store.ts` | toRow/fromRow updated; needs Folder CRUD + analytics user isolation |
| `lib/types.ts` | Complete |
| `components/upload/ReviewerSetupModal.tsx` | Complete; not yet used |
| `supabase/folders_and_isolation_migration.sql` | Complete; NOT YET RUN in Supabase |

---

## What Was Tried and Failed

**Agent API rate limit** — Both the backend-db-architect and frontend-general-purpose agents hit the Supabase/Anthropic rate limit mid-session (`"You've hit your limit · resets 12:30am (Asia/Manila)"`). The backend agent completed Phase 2 (migration file) and partial Phase 3 (toRow/fromRow). The frontend agent created ReviewerSetupModal and cleaned up auth pages but did not complete the library rewrite or UploadZone changes.

---

## Architecture Decisions Made This Session

1. **Service-key client bypasses RLS** — `lib/supabase.ts` uses `SUPABASE_SECRET_KEY`. RLS policies in the migration are defense-in-depth only. Primary isolation is enforced via explicit `.eq("user_id", userId)` in every store function + auth checks at every API route level.

2. **Folder colors use a static lookup map** — Dynamic Tailwind class strings get purged. All folder color logic must use `folderColorMap` in `FolderCard.tsx` (see ReviewerSetupModal for the pattern).

3. **Upload → setup modal → document page** — Reviewer generation is NOT triggered during upload. Upload saves the doc, modal collects name/folder/method, then navigation to `/document/[id]` triggers generation as before.

4. **`/api/folders` uses action-based dispatch** — Single POST endpoint handles create/update/delete/move_document/rename_document via an `action` field in the body. Keeps the folder surface to GET + POST.

5. **analytics_meta per-user upsert** — Uses `onConflict: "user_id"` after adding the unique index. The legacy singleton row (id=1, user_id=NULL) is left intact.

---

## Next Steps (in order)

### Step 1 — Run the database migration
Go to Supabase SQL Editor → paste contents of `supabase/folders_and_isolation_migration.sql` → run. Verify the `folders` table and new columns appear.

### Step 2 — Complete store layer (`lib/store.ts`)

Add the private helper and update analytics functions:
```ts
async function _updateAnalyticsMeta(userId: string, studyMinutes: number): Promise<void> { ... }
```
Change `listDocuments(userId?: string)` → `listDocuments(userId: string)` + always `.eq("user_id", userId)` + add `folder_id` to SELECT + expose `folderId` in returned objects.
Change `deleteDocument(id: string)` → `deleteDocument(id: string, userId: string)`.
Change analytics function signatures to accept `userId`.
Add the Folder CRUD block (createFolder, listFolders, updateFolder, deleteFolder, moveDocumentToFolder, renameDocument).

### Step 3 — Create `/app/api/folders/route.ts`
Full content is specified in the orchestrator plan above. Import: createFolder, listFolders, updateFolder, deleteFolder, moveDocumentToFolder, renameDocument from `@/lib/store`.

### Step 4 — Update existing API routes
- `app/api/library/route.ts` — add auth, pass userId
- `app/api/analytics/route.ts` — add auth, pass userId
- `app/api/upload/route.ts` — accept folderId + reviewerName from form data
- `app/page.tsx` — pass userId to listDocuments in RecentDocuments

### Step 5 — Wire ReviewerSetupModal into UploadZone
Modify `components/upload-zone.tsx`: after successful upload, instead of `router.push(...)`, fetch `/api/folders`, set `setupPending` state, render `<ReviewerSetupModal>`. Modal's onConfirm calls rename/move/progression APIs then navigates.

### Step 6 — Build library components
Create `components/library/FolderCard.tsx` and `components/library/DocumentCard.tsx`, then rewrite `app/library/page.tsx` as a client component with folder-first layout.

### Step 7 — TypeScript check
```bash
cd /Users/davecardona/learning-platform && npx tsc --noEmit
```
Expected errors: callers of listDocuments/deleteDocument/analytics functions that don't yet pass userId. Fix each one.

---

## Key Reference: Orchestrator Plan

The master-architect-orchestrator produced a detailed plan covering all 6 phases with exact SQL, function signatures, and component specs. That plan is in the conversation context of this session. If starting fresh, re-run the orchestrator with the same prompt (it will re-read the codebase) or reference this handoff for the specification.

---
name: project-auth-system
description: Auth system implementation details — clients, middleware, pages, and profile schema for the learning platform
metadata:
  type: project
---

Auth system implemented with `@supabase/ssr`. Two Supabase clients coexist:
- `lib/supabase.ts` — original server-only client using `SUPABASE_SECRET_KEY` (non-auth DB ops). Do NOT touch.
- `lib/supabase-browser.ts` — `createBrowserClient` using `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `lib/supabase-server.ts` — `createServerClient` using cookies (for Server Components and route handlers)

**Required env vars** (not yet in `.env.local` — user must add):
- `NEXT_PUBLIC_SUPABASE_URL` (same value as `SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon/public key from Supabase dashboard)

**Middleware** (`middleware.ts` at project root):
- Refreshes session on every request via `supabase.auth.getUser()`
- Redirects unauthenticated users to `/auth/login?next=<path>` for: `/document/*`, `/library`, `/analytics`, `/flashcards`, `/tutor`
- Home (`/`) and `/api/*` are public

**Auth pages:**
- `/auth/login` — email/password + Google OAuth, inline error messages, dark theme
- `/auth/signup` — email/password + Google OAuth, shows "Check your email" state on success
- `/auth/callback` — exchanges OAuth code for session, upserts `user_profiles` (ignoreDuplicates), prevents open redirect
- `/auth/confirm` — handles `token_hash`/`type` email confirmation tokens

**AuthProvider** (`components/auth/AuthProvider.tsx`):
- Client component at root of tree (wraps SidebarProvider in layout.tsx)
- Exposes `useAuth()` → `{ user, session, loading, signOut }`
- Uses `onAuthStateChange` for reactive state

**Sidebar auth UI** (`components/layout/Sidebar.tsx`):
- Logged in: avatar (Google photo or User icon), display name, email, logout button
- Logged out: "Sign in" button linking to `/auth/login`
- Collapsed mode shows icon-only variants

**DB migration:** `supabase/auth_schema.sql`
- `user_profiles` table (id → auth.users, username UNIQUE, display_name, avatar_url)
- `handle_new_user()` trigger auto-creates profile on `auth.users` INSERT
- RLS: SELECT public, UPDATE/INSERT own row only

**Why:** Separation of concerns — SUPABASE_SECRET_KEY client bypasses RLS for server-side DB ops; anon key client respects RLS and is safe for browser use.
**How to apply:** Never use `lib/supabase.ts` (secret key) in client components or auth flows. Always use the browser/server clients from `@supabase/ssr` for session-aware operations.

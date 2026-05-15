---
name: project-platform-overview
description: Stack, conventions, and key architectural decisions for this Next.js 14 + Supabase + Claude learning platform
metadata:
  type: project
---

Next.js 14 App Router + Supabase Postgres + Anthropic Claude AI. Personal study platform with mastery-gated progression.

**Why:** Core product decisions made before this memory was written. See CLAUDE.md for canonical detail.

**How to apply:** All new features must use AppShell wrapper, server components where possible, and route all DB access through lib/store.ts. AI model is claude-opus-4-5 defined as MODEL constant in lib/claude.ts.

Key conventions:
- Dark theme: bg-gray-800/gray-900, accent indigo-500/600
- All pages wrapped in AppShell (never add Sidebar directly)
- Supabase client via lib/supabase.ts (secret key, server-only); browser client via lib/supabase-browser.ts
- AI prompts versioned in lib/prompts.ts; all AI calls go through generateStructured() with Zod validation
- @/ path alias maps to project root
- hooks/ directory lives at project root (not inside src/ or app/)

[[project-compete-match-ui]]

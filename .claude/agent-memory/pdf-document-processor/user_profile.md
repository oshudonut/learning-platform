---
name: user-profile
description: Developer building a Next.js 14 AI-powered learning platform, focused on token cost efficiency
metadata:
  type: user
---

Building a Next.js 14 learning platform at `/Users/davecardona/learning-platform` that uses Claude to generate reviewers, quizzes, and flashcards from uploaded PDFs.

Primary concern is token efficiency — avoids sending large raw-text blobs to Claude unnecessarily. Prefers production-quality TypeScript with clear inline documentation. Existing shared types live in `lib/types.ts`; always check there before defining new shapes.

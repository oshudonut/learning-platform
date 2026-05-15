# Future Risks

Known architectural risks that are not yet bugs but will become problems as usage scales or features are added.

---

## Security Risks

### Service-key bypasses RLS entirely
`lib/supabase.ts` uses `SUPABASE_SECRET_KEY`. This means every RLS policy in the DB is decorative — the client never evaluates them. All isolation must be enforced by explicit `.eq("user_id", userId)` in `lib/store.ts`. A single store function that omits the userId guard exposes all users' data. This is the root cause of C1.

**Risk**: Any future store function added without a userId guard silently creates a data exposure. No test or TypeScript check will catch it.

**Mitigation**: Consider a linting rule or store wrapper that requires userId on every read/write. At minimum, code review must check every new store function.

### `OR user_id IS NULL` escape hatch (pending migration)
Until `final_isolation_hardening.sql` is run in production, RLS policies have an `OR user_id IS NULL` clause that allows unauthenticated/legacy reads. This migration is written and ready but not yet executed.

---

## Data Integrity Risks

### Progression concurrent write race (C3)
Two browser tabs completing sections simultaneously can silently overwrite each other's checkpoint state. A user can be locked out of quiz unlock with no error message. This is a real-world race on any multi-tab study session.

### `learningMethod` wipe on progression rebuild
Fixed this session (`rebuildSectionStatuses`), but any future code that reconstructs a `DocumentProgression` object without copying all fields from the DB row will silently wipe `learningMethod`, `studyMode`, and any other fields added in the future.

**Pattern to avoid**: `const fresh = defaultProgression(); Object.assign(fresh, partialFields); return fresh;` — this pattern requires updating the copy list every time a new field is added to `DocumentProgression`.

---

## AI / Cost Risks

### Uncapped `doc.text` in generation routes (H1)
Quiz and flashcard routes send raw `doc.text` with no character cap. A 200-page PDF can send ~200K chars (~50K tokens) on every generation call. At scale this is a significant cost driver. The reviewer already caps at 4K chars. Shared `getContextForGeneration(doc, maxChars)` needs to be built and applied.

### No prompt caching on tutor (H4)
Each tutor turn re-sends the full system prompt (including methodology addendum, which is now longer). A 20-turn session pays full input token cost every turn. `cache_control: { type: "ephemeral" }` on the system prompt block is a free fix with ~10x cost reduction on long tutor sessions.

### All generation on `claude-opus-4-5`
Grading short open answers (identification, fill-in-the-blank) and generating 5-8 checkpoint flashcards are sub-500-token tasks currently routed to Opus. Haiku is ~5x cheaper and sufficient for these tasks. No model routing logic exists yet.

---

## Educational Integrity Risks

### Quiz can test untaught content (C4)
Until `reviewer_topics` table is built and the quiz route is constrained to those topics, quiz generation reads raw `doc.text` and independently decides what to test. A student can master topics A/B/C in the reviewer and be quizzed on D/E/F. The 95% pass threshold makes this particularly punishing.

### Checkpoint skip bypass (C2)
Any network error during checkpoint flashcard generation causes the "Skip Checkpoint" button to appear. The skip path calls `complete_checkpoint` with no server-side verification of card completion. The mastery gate is bypassable in any flaky network condition.

### Remediation has no read-gate (H8)
Students can fail a quiz, immediately call `complete_remediation`, and unlock the quiz retry without reading any remediation content. The remediation reviewer is generated but its completion has no enforcement.

---

## Frontend Risks

### Optimistic mutations without rollback (FE-1)
`submitDocRename` and `handleDocMove` update local state before the API call confirms. On failure, the UI shows the new state but the DB has the old state. The divergence persists until page refresh.

### Session expiry (FE-4)
No coordinated session expiry handling. When a Supabase session expires mid-study, API calls silently return 401s. The user sees broken behavior with no prompt to re-authenticate.

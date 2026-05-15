-- ─── Final Isolation Hardening ───────────────────────────────────────────────
--
-- PURPOSE: Permanently close the "OR user_id IS NULL" RLS escape hatch on
--   documents, quiz_attempts, flashcard_sessions, and analytics_meta.
--
-- WHAT THIS DOES (in order):
--   1. Deletes all orphan rows (user_id IS NULL) from affected tables.
--   2. Adds NOT NULL constraints to user_id on documents, quiz_attempts,
--      and flashcard_sessions.  (analytics_meta is excluded — see note below.)
--   3. Drops and recreates all affected RLS policies without OR user_id IS NULL.
--
-- WARNING — THE DELETES IN SECTION 1 ARE IRREVERSIBLE.
--   Orphan rows have no owner and cannot be recovered after deletion.
--   Before running this migration, execute the following advisory queries
--   to understand how many rows will be deleted:
--
--     SELECT COUNT(*) FROM documents          WHERE user_id IS NULL;
--     SELECT COUNT(*) FROM quiz_attempts      WHERE user_id IS NULL;
--     SELECT COUNT(*) FROM flashcard_sessions WHERE user_id IS NULL;
--     SELECT COUNT(*) FROM analytics_meta     WHERE user_id IS NULL;
--
--   If the counts are unexpectedly high, investigate before proceeding.
--   This script is idempotent — it is safe to re-run if interrupted.
--
-- NOTE on analytics_meta: The NOT NULL constraint is intentionally omitted.
--   The analytics_meta table uses a sequence-based integer PK and was
--   originally a global singleton row.  The column constraint is left as-is;
--   only the RLS policies are tightened.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Delete orphan rows (user_id IS NULL) ──────────────────────────────────

DELETE FROM documents          WHERE user_id IS NULL;
DELETE FROM quiz_attempts      WHERE user_id IS NULL;
DELETE FROM flashcard_sessions WHERE user_id IS NULL;
DELETE FROM analytics_meta     WHERE user_id IS NULL;


-- ─── 2. Enforce NOT NULL on user_id ──────────────────────────────────────────
--
-- Allowed now that all NULL rows have been removed.
-- analytics_meta is excluded — see header note.

ALTER TABLE documents
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE quiz_attempts
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE flashcard_sessions
  ALTER COLUMN user_id SET NOT NULL;


-- ─── 3. Tighten RLS — documents ───────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_select_own" ON documents;
CREATE POLICY "documents_select_own" ON documents
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_insert_own" ON documents;
CREATE POLICY "documents_insert_own" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_update_own" ON documents;
CREATE POLICY "documents_update_own" ON documents
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_delete_own" ON documents;
CREATE POLICY "documents_delete_own" ON documents
  FOR DELETE USING (auth.uid() = user_id);


-- ─── 4. Tighten RLS — quiz_attempts ──────────────────────────────────────────

DROP POLICY IF EXISTS "quiz_attempts_select_own" ON quiz_attempts;
CREATE POLICY "quiz_attempts_select_own" ON quiz_attempts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_attempts_insert_own" ON quiz_attempts;
CREATE POLICY "quiz_attempts_insert_own" ON quiz_attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 5. Tighten RLS — flashcard_sessions ─────────────────────────────────────

DROP POLICY IF EXISTS "flashcard_sessions_select_own" ON flashcard_sessions;
CREATE POLICY "flashcard_sessions_select_own" ON flashcard_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "flashcard_sessions_insert_own" ON flashcard_sessions;
CREATE POLICY "flashcard_sessions_insert_own" ON flashcard_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─── 6. Tighten RLS — analytics_meta ─────────────────────────────────────────

DROP POLICY IF EXISTS "analytics_meta_select_own" ON analytics_meta;
CREATE POLICY "analytics_meta_select_own" ON analytics_meta
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "analytics_meta_insert_own" ON analytics_meta;
CREATE POLICY "analytics_meta_insert_own" ON analytics_meta
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "analytics_meta_update_own" ON analytics_meta;
CREATE POLICY "analytics_meta_update_own" ON analytics_meta
  FOR UPDATE USING (auth.uid() = user_id);


-- ─── Done ─────────────────────────────────────────────────────────────────────
--
-- Orphan rows deleted, NOT NULL constraints applied to documents /
-- quiz_attempts / flashcard_sessions, and all twelve RLS policies across
-- four tables have been recreated without the OR user_id IS NULL escape hatch.
-- Every authenticated user can now only see and modify their own rows.
-- ─────────────────────────────────────────────────────────────────────────────

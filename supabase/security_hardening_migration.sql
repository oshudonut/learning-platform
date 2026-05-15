-- Stage 1 Security Hardening Migration
-- Status: APPLIED 2026-05-15
-- Run via Supabase Management API — see session notes for execution log.

-- ─── 1. Add user_id to conversations ─────────────────────────────────────────
-- STATUS: APPLIED

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 2. RLS for conversations ─────────────────────────────────────────────────
-- STATUS: APPLIED

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_own" ON conversations;
CREATE POLICY "conversations_select_own" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversations_insert_own" ON conversations;
CREATE POLICY "conversations_insert_own" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversations_update_own" ON conversations;
CREATE POLICY "conversations_update_own" ON conversations
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "conversations_delete_own" ON conversations;
CREATE POLICY "conversations_delete_own" ON conversations
  FOR DELETE USING (auth.uid() = user_id);

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────
-- STATUS: APPLIED (all four below)

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_document_id_idx ON conversations(document_id);

-- Applied after manual deduplication (8 duplicate CT ENDTERM REVIEWER docs deleted,
-- kept newest: a12k3zqkmp5sxu0a).
CREATE UNIQUE INDEX IF NOT EXISTS documents_user_content_hash_uidx
  ON documents(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- SKIPPED: user_profiles has no xp column — leaderboard/XP feature not yet built.
-- Add when XP is implemented:
-- CREATE INDEX IF NOT EXISTS user_profiles_xp_idx ON user_profiles(xp DESC);

-- ─── 4. Tighten documents RLS ─────────────────────────────────────────────────
-- STATUS: APPLIED (no NULL user_id rows found)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM documents WHERE user_id IS NULL LIMIT 1) THEN
    RAISE NOTICE 'SKIP: documents with user_id IS NULL still exist — RLS not tightened. Migrate those rows first.';
  ELSE
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

    RAISE NOTICE 'OK: documents RLS tightened — OR user_id IS NULL removed.';
  END IF;
END $$;

-- ─── 5. Tighten quiz_attempts and flashcard_sessions RLS ─────────────────────
-- STATUS: APPLIED (no NULL user_id rows found in either table)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM quiz_attempts WHERE user_id IS NULL LIMIT 1) THEN
    RAISE NOTICE 'SKIP: quiz_attempts has NULL user_id rows.';
  ELSE
    DROP POLICY IF EXISTS "quiz_attempts_select_own" ON quiz_attempts;
    CREATE POLICY "quiz_attempts_select_own" ON quiz_attempts
      FOR SELECT USING (auth.uid() = user_id);
    DROP POLICY IF EXISTS "quiz_attempts_insert_own" ON quiz_attempts;
    CREATE POLICY "quiz_attempts_insert_own" ON quiz_attempts
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    RAISE NOTICE 'OK: quiz_attempts RLS tightened.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM flashcard_sessions WHERE user_id IS NULL LIMIT 1) THEN
    RAISE NOTICE 'SKIP: flashcard_sessions has NULL user_id rows.';
  ELSE
    DROP POLICY IF EXISTS "flashcard_sessions_select_own" ON flashcard_sessions;
    CREATE POLICY "flashcard_sessions_select_own" ON flashcard_sessions
      FOR SELECT USING (auth.uid() = user_id);
    DROP POLICY IF EXISTS "flashcard_sessions_insert_own" ON flashcard_sessions;
    CREATE POLICY "flashcard_sessions_insert_own" ON flashcard_sessions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    RAISE NOTICE 'OK: flashcard_sessions RLS tightened.';
  END IF;
END $$;

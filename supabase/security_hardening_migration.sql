-- Stage 1 Security Hardening Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─── 1. Add user_id to conversations ─────────────────────────────────────────

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 2. RLS for conversations ─────────────────────────────────────────────────

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

-- ─── 3. Missing indexes ───────────────────────────────────────────────────────

-- Speeds up all user-scoped document queries (listDocuments, getDocument, etc.)
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);

-- Per-user content dedup index (content_hash uniqueness scoped to user)
CREATE UNIQUE INDEX IF NOT EXISTS documents_user_content_hash_uidx
  ON documents(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- Speeds up leaderboard ORDER BY xp DESC
CREATE INDEX IF NOT EXISTS user_profiles_xp_idx ON user_profiles(xp DESC);

-- Speeds up conversation lookups by user and document
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_document_id_idx ON conversations(document_id);

-- ─── 4. Tighten documents RLS (remove OR user_id IS NULL) ────────────────────
-- Only runs if no legacy NULL-user documents remain.

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

-- ─── 5. Same tightening for quiz_attempts and flashcard_sessions ──────────────

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

-- ─── Folders ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS folders (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT 'blue',
  created_at bigint NOT NULL,
  updated_at bigint
);

CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders(user_id);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "folders_select_own" ON folders;
CREATE POLICY "folders_select_own" ON folders
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "folders_insert_own" ON folders;
CREATE POLICY "folders_insert_own" ON folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "folders_update_own" ON folders;
CREATE POLICY "folders_update_own" ON folders
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "folders_delete_own" ON folders;
CREATE POLICY "folders_delete_own" ON folders
  FOR DELETE USING (auth.uid() = user_id);

-- ─── Documents: add folder_id ─────────────────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS folder_id text REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_folder_id_idx ON documents(folder_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select_own" ON documents;
CREATE POLICY "documents_select_own" ON documents
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "documents_insert_own" ON documents;
CREATE POLICY "documents_insert_own" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "documents_update_own" ON documents;
CREATE POLICY "documents_update_own" ON documents
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "documents_delete_own" ON documents;
CREATE POLICY "documents_delete_own" ON documents
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);

-- ─── quiz_attempts: add user_id ──────────────────────────────────────────────

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS quiz_attempts_user_id_idx ON quiz_attempts(user_id);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_attempts_select_own" ON quiz_attempts;
CREATE POLICY "quiz_attempts_select_own" ON quiz_attempts
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "quiz_attempts_insert_own" ON quiz_attempts;
CREATE POLICY "quiz_attempts_insert_own" ON quiz_attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ─── flashcard_sessions: add user_id ─────────────────────────────────────────

ALTER TABLE flashcard_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS flashcard_sessions_user_id_idx ON flashcard_sessions(user_id);

ALTER TABLE flashcard_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flashcard_sessions_select_own" ON flashcard_sessions;
CREATE POLICY "flashcard_sessions_select_own" ON flashcard_sessions
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "flashcard_sessions_insert_own" ON flashcard_sessions;
CREATE POLICY "flashcard_sessions_insert_own" ON flashcard_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ─── analytics_meta: per-user migration ──────────────────────────────────────

ALTER TABLE analytics_meta DROP CONSTRAINT IF EXISTS single_row;
ALTER TABLE analytics_meta ALTER COLUMN id DROP DEFAULT;
ALTER TABLE analytics_meta ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_meta_user_id_uidx ON analytics_meta(user_id)
  WHERE user_id IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS analytics_meta_id_seq START WITH 100;
ALTER TABLE analytics_meta ALTER COLUMN id SET DEFAULT nextval('analytics_meta_id_seq');

ALTER TABLE analytics_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_meta_select_own" ON analytics_meta;
CREATE POLICY "analytics_meta_select_own" ON analytics_meta
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "analytics_meta_insert_own" ON analytics_meta;
CREATE POLICY "analytics_meta_insert_own" ON analytics_meta
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "analytics_meta_update_own" ON analytics_meta;
CREATE POLICY "analytics_meta_update_own" ON analytics_meta
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

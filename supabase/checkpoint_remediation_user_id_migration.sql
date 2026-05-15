-- Add user_id to checkpoint_flashcards and remediation_reviewers
-- Backfills from documents.user_id, applies NOT NULL, adds indexes and RLS.

-- ─── checkpoint_flashcards ────────────────────────────────────────────────────

ALTER TABLE checkpoint_flashcards
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE checkpoint_flashcards cf
SET user_id = d.user_id
FROM documents d
WHERE cf.document_id = d.id AND cf.user_id IS NULL;

ALTER TABLE checkpoint_flashcards
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS checkpoint_flashcards_user_id_idx ON checkpoint_flashcards(user_id);

ALTER TABLE checkpoint_flashcards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkpoint_flashcards_select_own" ON checkpoint_flashcards;
CREATE POLICY "checkpoint_flashcards_select_own" ON checkpoint_flashcards
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "checkpoint_flashcards_insert_own" ON checkpoint_flashcards;
CREATE POLICY "checkpoint_flashcards_insert_own" ON checkpoint_flashcards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "checkpoint_flashcards_update_own" ON checkpoint_flashcards;
CREATE POLICY "checkpoint_flashcards_update_own" ON checkpoint_flashcards
  FOR UPDATE USING (auth.uid() = user_id);

-- ─── remediation_reviewers ────────────────────────────────────────────────────

ALTER TABLE remediation_reviewers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE remediation_reviewers rr
SET user_id = d.user_id
FROM documents d
WHERE rr.document_id = d.id AND rr.user_id IS NULL;

ALTER TABLE remediation_reviewers
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS remediation_reviewers_user_id_idx ON remediation_reviewers(user_id);

ALTER TABLE remediation_reviewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remediation_reviewers_select_own" ON remediation_reviewers;
CREATE POLICY "remediation_reviewers_select_own" ON remediation_reviewers
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "remediation_reviewers_insert_own" ON remediation_reviewers;
CREATE POLICY "remediation_reviewers_insert_own" ON remediation_reviewers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

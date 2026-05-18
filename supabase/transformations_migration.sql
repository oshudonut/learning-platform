-- Phase 5: study_transformations table
-- Stores every generated study artifact (reviewer, rapid_recall, flashcards, quiz, etc.)
-- Separate from documents table to support multiple versions, history, and cache lookups.
-- Documents.reviewer is kept for backward compat and mirrored from reviewer-type transforms.

CREATE TABLE IF NOT EXISTS study_transformations (
  id                  TEXT        PRIMARY KEY,
  document_id         TEXT        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id             TEXT        NOT NULL,
  transcript_version  INTEGER     NOT NULL DEFAULT 1,
  transformation_type TEXT        NOT NULL,
  learning_method     TEXT,
  study_mode          TEXT,
  schema_type         TEXT,
  generated_at        BIGINT      NOT NULL,
  model               TEXT        NOT NULL DEFAULT '',
  generation_time_ms  INTEGER     NOT NULL DEFAULT 0,
  input_tokens        INTEGER     NOT NULL DEFAULT 0,
  output_tokens       INTEGER     NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER     NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER     NOT NULL DEFAULT 0,
  estimated_cost_usd  NUMERIC(10,6) NOT NULL DEFAULT 0,
  source_anchors      JSONB       NOT NULL DEFAULT '[]',
  metadata            JSONB       NOT NULL DEFAULT '{}',
  content             JSONB       NOT NULL,
  superseded_by       TEXT        REFERENCES study_transformations(id),
  created_at          BIGINT      NOT NULL
);

-- Fast cache lookups: (document, user, type, method, mode)
CREATE INDEX IF NOT EXISTS idx_st_cache
  ON study_transformations(document_id, user_id, transformation_type, learning_method, study_mode);

-- History ordered by recency
CREATE INDEX IF NOT EXISTS idx_st_history
  ON study_transformations(document_id, user_id, created_at DESC);

-- RLS: users own their transformations
ALTER TABLE study_transformations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'study_transformations'
      AND policyname = 'Users own their transformations'
  ) THEN
    CREATE POLICY "Users own their transformations"
      ON study_transformations FOR ALL
      USING (user_id = auth.uid()::text)
      WITH CHECK (user_id = auth.uid()::text);
  END IF;
END $$;

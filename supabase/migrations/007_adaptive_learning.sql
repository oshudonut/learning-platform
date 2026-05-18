-- ─── Adaptive Learning Storage ────────────────────────────────────────────────
-- learning_signals: immutable event log, append-only
-- topic_mastery_snapshots: derived mastery state, upserted on recompute

-- ─── Learning Signals ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning_signals (
  id                  text PRIMARY KEY,
  user_id             text NOT NULL,
  document_id         text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  canonical_topic_id  text,
  topic_fingerprint   text,
  signal_type         text NOT NULL,
  confidence          real,
  duration_ms         integer,
  metadata            jsonb NOT NULL DEFAULT '{}',
  transcript_version  integer,
  transformation_id   text,
  created_at          bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_signals_user_doc
  ON learning_signals(user_id, document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_signals_topic
  ON learning_signals(user_id, canonical_topic_id)
  WHERE canonical_topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_signals_type
  ON learning_signals(user_id, document_id, signal_type);

ALTER TABLE learning_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_signals_owner" ON learning_signals
  FOR ALL USING (user_id = auth.uid()::text);

-- ─── Topic Mastery Snapshots ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS topic_mastery_snapshots (
  id                  text PRIMARY KEY,
  user_id             text NOT NULL,
  document_id         text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  canonical_topic_id  text NOT NULL,
  topic_fingerprint   text,
  mastery_level       text NOT NULL DEFAULT 'unfamiliar',
  confidence_score    real NOT NULL DEFAULT 0,
  retention_score     real NOT NULL DEFAULT 0,
  exposure_count      integer NOT NULL DEFAULT 0,
  last_seen_at        bigint,
  updated_at          bigint NOT NULL,
  UNIQUE(user_id, canonical_topic_id)
);

CREATE INDEX IF NOT EXISTS idx_mastery_snapshots_doc
  ON topic_mastery_snapshots(user_id, document_id);

CREATE INDEX IF NOT EXISTS idx_mastery_snapshots_weak
  ON topic_mastery_snapshots(user_id, document_id, mastery_level)
  WHERE mastery_level IN ('unfamiliar', 'struggling');

ALTER TABLE topic_mastery_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mastery_snapshots_owner" ON topic_mastery_snapshots
  FOR ALL USING (user_id = auth.uid()::text);

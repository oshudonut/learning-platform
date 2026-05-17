-- Tracks AI companion calls for rate limiting and analytics.
-- One row per companion response, regardless of trigger type.

CREATE TABLE IF NOT EXISTS ai_companion_events (
  id            text    PRIMARY KEY,
  user_id       text    NOT NULL,
  document_id   text    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  topic_index   integer NOT NULL,
  trigger_type  text    NOT NULL,  -- explicit_help | confusion
  tokens_input  integer,
  tokens_output integer,
  created_at    bigint  NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

CREATE INDEX IF NOT EXISTS idx_companion_events_user_day
  ON ai_companion_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companion_events_user_doc
  ON ai_companion_events(user_id, document_id, created_at DESC);

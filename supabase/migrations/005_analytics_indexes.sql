CREATE INDEX IF NOT EXISTS idx_learning_analytics_event_type
  ON learning_analytics(user_id, event_type, recorded_at DESC);

-- ─── Study Planner Tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS study_plans (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  exam_date   bigint NOT NULL,
  daily_hours real NOT NULL DEFAULT 2,
  status      text NOT NULL DEFAULT 'active',
  created_at  bigint NOT NULL,
  updated_at  bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans(user_id, status);

-- Per-document membership in a plan (priority + pause control)
CREATE TABLE IF NOT EXISTS study_plan_documents (
  id                text PRIMARY KEY,
  plan_id           text NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  document_id       text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  priority          integer NOT NULL DEFAULT 1,
  weak_topic_weight real NOT NULL DEFAULT 1.0,
  paused            boolean NOT NULL DEFAULT false,
  added_at          bigint NOT NULL,
  UNIQUE(plan_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_docs_plan ON study_plan_documents(plan_id);

-- Scheduled study tasks
CREATE TABLE IF NOT EXISTS study_plan_items (
  id              text PRIMARY KEY,
  plan_id         text NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  document_id     text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  item_type       text NOT NULL,
  scheduled_date  bigint NOT NULL,
  completed_at    bigint,
  skipped_at      bigint,
  section_indices integer[] NOT NULL DEFAULT '{}',
  estimated_mins  integer NOT NULL DEFAULT 20,
  metadata        jsonb NOT NULL DEFAULT '{}',
  position        real NOT NULL DEFAULT 0,
  created_at      bigint NOT NULL,
  updated_at      bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_items_plan_date ON study_plan_items(plan_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_plan_items_pending   ON study_plan_items(plan_id, scheduled_date)
  WHERE completed_at IS NULL AND skipped_at IS NULL;

-- Spaced repetition review events (SM-2-derived scheduling)
CREATE TABLE IF NOT EXISTS review_schedule_events (
  id            text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id       text REFERENCES study_plans(id) ON DELETE SET NULL,
  document_id   text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  due_at        bigint NOT NULL,
  interval_days integer NOT NULL DEFAULT 1,
  ease_factor   real NOT NULL DEFAULT 2.5,
  completed_at  bigint,
  created_at    bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_events_due  ON review_schedule_events(user_id, due_at)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_events_plan ON review_schedule_events(plan_id)
  WHERE completed_at IS NULL;

create table if not exists document_progressions (
  document_id              text primary key references documents(id) on delete cascade,
  section_statuses         jsonb not null default '[]',
  checkpoint_statuses      jsonb not null default '[]',
  quiz_unlocked            boolean not null default false,
  mastered_at              bigint,
  difficulty_level         text not null default 'beginner',
  remediation_active       boolean not null default false,
  remediation_completed_at bigint,
  created_at               bigint not null,
  updated_at               bigint not null
);

create table if not exists checkpoint_flashcards (
  id                bigserial primary key,
  document_id       text not null references documents(id) on delete cascade,
  checkpoint_index  integer not null,
  cards             jsonb not null default '[]',
  generated_at      bigint not null,
  unique(document_id, checkpoint_index)
);

create table if not exists remediation_reviewers (
  id              bigserial primary key,
  document_id     text not null references documents(id) on delete cascade,
  weak_topics     jsonb not null default '[]',
  content         jsonb not null,
  generated_at    bigint not null
);

alter table quiz_attempts
  add column if not exists difficulty_level       text not null default 'beginner',
  add column if not exists passed                 boolean not null default false,
  add column if not exists attempt_number         integer not null default 1,
  add column if not exists triggered_remediation  boolean not null default false;

-- Add section navigation and flashcard gating columns
ALTER TABLE document_progressions
  ADD COLUMN IF NOT EXISTS current_section_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flashcard_challenge_completed boolean DEFAULT false;

-- Add learning profile columns
ALTER TABLE document_progressions
  ADD COLUMN IF NOT EXISTS learning_method text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS study_mode text DEFAULT NULL;

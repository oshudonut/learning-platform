create table if not exists documents (
  id text primary key,
  title text not null,
  filename text not null,
  text text not null,
  text_length integer not null,
  content_hash text,
  created_at bigint not null,
  reviewer jsonb,
  quiz jsonb,
  flashcards jsonb,
  flashcard_review_states jsonb,
  chunks jsonb
);

create table if not exists conversations (
  id text primary key,
  document_id text,
  document_title text,
  messages jsonb not null default '[]',
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists quiz_attempts (
  id bigserial primary key,
  quiz_id text not null,
  document_id text not null,
  document_title text not null,
  score integer not null,
  total_questions integer not null,
  correct_answers integer not null,
  weak_topics jsonb not null default '[]',
  completed_at bigint not null,
  duration_minutes integer
);

create table if not exists flashcard_sessions (
  id bigserial primary key,
  document_id text not null,
  document_title text not null,
  cards_studied integer not null,
  avg_quality real not null,
  completed_at bigint not null
);

create table if not exists analytics_meta (
  id integer primary key default 1,
  study_streak integer not null default 0,
  last_studied bigint,
  total_study_time integer not null default 0,
  constraint single_row check (id = 1)
);

insert into analytics_meta (id) values (1) on conflict do nothing;

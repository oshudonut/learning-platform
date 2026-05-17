create table if not exists reviewer_notes (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  document_id       text not null references documents(id) on delete cascade,
  topic_index       integer not null,
  note_text         text not null default '',
  ai_tags           jsonb,
  confusion_level   integer check (confusion_level between 1 and 5),
  linked_concepts   text[],
  created_at        bigint not null,
  updated_at        bigint not null,
  unique(user_id, document_id, topic_index)
);
create index if not exists idx_reviewer_notes_doc on reviewer_notes(user_id, document_id);
create index if not exists idx_reviewer_notes_topic on reviewer_notes(document_id, topic_index);

create table if not exists learning_analytics (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  document_id   text references documents(id) on delete set null,
  event_type    text not null,
  event_data    jsonb not null default '{}',
  recorded_at   bigint not null
);
create index if not exists idx_learning_analytics_user on learning_analytics(user_id, recorded_at desc);
create index if not exists idx_learning_analytics_doc on learning_analytics(user_id, document_id, event_type);

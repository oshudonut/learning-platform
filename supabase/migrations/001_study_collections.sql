create table if not exists study_collections (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  color        text not null default 'blue',
  created_at   bigint not null,
  updated_at   bigint not null
);
create index if not exists idx_study_collections_user on study_collections(user_id);

create table if not exists collection_items (
  id              text primary key,
  collection_id   text not null references study_collections(id) on delete cascade,
  document_id     text not null references documents(id) on delete cascade,
  position        real not null,
  added_at        bigint not null,
  unique(collection_id, document_id)
);
create index if not exists idx_collection_items_collection on collection_items(collection_id, position);
create index if not exists idx_collection_items_document on collection_items(document_id);

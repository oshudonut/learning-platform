-- Inline text highlights created by the user while reading a reviewer section.
-- Char offsets are stored relative to the full raw string (including semantic prefix).
-- The field_name matches the ReviewerTopic property name; item_index is the array index.

CREATE TABLE IF NOT EXISTS reviewer_highlights (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text    NOT NULL,
  document_id text    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  topic_index integer NOT NULL,
  field_name  text    NOT NULL,  -- keyPoints | mustMemorize | quickBreakdown | quickRecall | coreIdea
  item_index  integer NOT NULL DEFAULT 0,
  char_start  integer NOT NULL,
  char_end    integer NOT NULL,
  color_tag   text    NOT NULL DEFAULT 'yellow',  -- yellow | green | blue | pink
  is_stale    boolean NOT NULL DEFAULT false,
  created_at  bigint  NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

CREATE INDEX IF NOT EXISTS idx_highlights_doc_user
  ON reviewer_highlights(document_id, user_id);

CREATE INDEX IF NOT EXISTS idx_highlights_stale
  ON reviewer_highlights(document_id, user_id)
  WHERE is_stale = true;

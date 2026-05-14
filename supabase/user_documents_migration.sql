-- Add user_id to documents table so each document is owned by a user.
-- Run in Supabase SQL Editor.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);

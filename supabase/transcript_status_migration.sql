-- Phase 3.5: transcript processing state machine
-- Safe to run multiple times (IF NOT EXISTS / idempotent defaults).
-- Old documents receive DEFAULT values automatically — no data migration needed.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS transcript_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_attempt_at BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

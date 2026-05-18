-- Add async transcript job columns to documents table.
-- storage_key: path in temp-uploads bucket; set when OCR is deferred, cleared after processor succeeds.
-- last_error:  human-readable error message from the most recent failed processing attempt.
-- processing_completed_at: epoch ms when status transitioned to completed or failed.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_key text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_completed_at bigint;

-- Create temporary upload bucket used during large-file ingestion.
-- Files are uploaded here directly from the browser (bypassing Vercel's 4.5 MB
-- function body limit), then the /api/upload route downloads, processes, and
-- removes them. Files here are ephemeral and not user-facing.

INSERT INTO storage.buckets (id, name, public, file_size_limit, avif_autodetection)
VALUES ('temp-uploads', 'temp-uploads', false, 26214400, false)
ON CONFLICT (id) DO NOTHING;

-- RLS: only the owning user's server-side admin client writes here.
-- Direct browser access is blocked; all uploads go through signed URLs issued
-- by /api/upload/presign (which validates auth before issuing them).
CREATE POLICY "service role only"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'temp-uploads')
  WITH CHECK (bucket_id = 'temp-uploads');

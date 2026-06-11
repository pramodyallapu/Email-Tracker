-- Live sync progress for UI (run in Supabase SQL Editor)
ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS sync_page_token text,
  ADD COLUMN IF NOT EXISTS sync_list_query text,
  ADD COLUMN IF NOT EXISTS sync_progress_synced integer NOT NULL DEFAULT 0;

-- Required for per-mailbox counts
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS mail_connection_id uuid REFERENCES mail_connections(id) ON DELETE SET NULL;

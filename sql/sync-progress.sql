-- Live sync progress for UI — run each block in Supabase SQL Editor.
-- Safe to re-run (IF NOT EXISTS).

-- ── mail_connections: sync progress columns ──────────────────────

ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'idle';

ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS sync_page_token text;

ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS sync_list_query text;

ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS sync_progress_synced integer DEFAULT 0;

ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS sync_gmail_total integer;

-- Backfill NOT NULL defaults where columns already existed
UPDATE mail_connections SET sync_status = 'idle' WHERE sync_status IS NULL;
UPDATE mail_connections SET sync_progress_synced = 0 WHERE sync_progress_synced IS NULL;

-- ── emails: link rows to a mailbox connection ────────────────────

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS mail_connection_id uuid
  REFERENCES mail_connections(id) ON DELETE SET NULL;

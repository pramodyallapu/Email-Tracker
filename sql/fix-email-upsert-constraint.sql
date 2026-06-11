-- Fix: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- Supabase upsert requires a NON-partial unique index on the conflict columns.
-- Run this in Supabase SQL Editor.

-- ── emails: org-scoped upsert (organization_id, provider, gmail_message_id) ──

DROP INDEX IF EXISTS emails_org_provider_message_uidx;

CREATE UNIQUE INDEX emails_org_provider_message_uidx
  ON emails (organization_id, provider, gmail_message_id);

-- Personal mailboxes (organization_id IS NULL) — keep separate index
DROP INDEX IF EXISTS emails_user_provider_message_uidx;

CREATE UNIQUE INDEX emails_user_provider_message_uidx
  ON emails (user_id, provider, gmail_message_id)
  WHERE organization_id IS NULL;

-- ── threads: same pattern ───────────────────────────────────────────

DROP INDEX IF EXISTS threads_org_provider_thread_uidx;

CREATE UNIQUE INDEX threads_org_provider_thread_uidx
  ON threads (organization_id, provider, gmail_thread_id);

DROP INDEX IF EXISTS threads_user_provider_thread_uidx;

CREATE UNIQUE INDEX threads_user_provider_thread_uidx
  ON threads (user_id, provider, gmail_thread_id)
  WHERE organization_id IS NULL;

-- Ensure org columns exist
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mail_connection_id uuid REFERENCES mail_connections(id) ON DELETE SET NULL;

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

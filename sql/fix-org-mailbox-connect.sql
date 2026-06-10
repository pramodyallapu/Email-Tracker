-- Fix "Could not save mailbox" when connecting Gmail to an organization.
-- Run this in Supabase SQL Editor if Add Gmail fails after organizations.sql.

-- 1. Allow org-scoped rows without user_id
ALTER TABLE mail_connections ALTER COLUMN user_id DROP NOT NULL;

-- 2. Org columns (safe if already applied)
ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS connected_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- 3. Replace old unique constraint with org + personal partial indexes
ALTER TABLE mail_connections DROP CONSTRAINT IF EXISTS mail_connections_user_id_provider_key;

CREATE UNIQUE INDEX IF NOT EXISTS mail_connections_org_mailbox_uidx
  ON mail_connections (organization_id, mailbox_email)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mail_connections_user_provider_uidx
  ON mail_connections (user_id, provider)
  WHERE organization_id IS NULL;

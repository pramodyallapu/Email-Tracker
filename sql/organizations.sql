-- Organization workspace: shared mailboxes + multiple managers
-- Run in Supabase SQL Editor AFTER schema-core.sql and mail-connections.sql

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('owner', 'manager', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

CREATE TABLE IF NOT EXISTS organization_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('owner', 'manager', 'member')),
  token uuid NOT NULL DEFAULT uuid_generate_v4(),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_token ON organization_invites(token);

-- ── mail_connections: org-scoped shared mailboxes ─────────────────

ALTER TABLE mail_connections
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS connected_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Org-owned shared mailboxes use organization_id, not user_id
ALTER TABLE mail_connections ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE mail_connections DROP CONSTRAINT IF EXISTS mail_connections_user_id_provider_key;

CREATE UNIQUE INDEX IF NOT EXISTS mail_connections_org_mailbox_uidx
  ON mail_connections (organization_id, mailbox_email)
  WHERE organization_id IS NOT NULL;

-- Legacy personal connections (pre-migration)
CREATE UNIQUE INDEX IF NOT EXISTS mail_connections_user_provider_uidx
  ON mail_connections (user_id, provider)
  WHERE organization_id IS NULL;

-- ── emails / threads: org-scoped data ─────────────────────────────

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mail_connection_id uuid REFERENCES mail_connections(id) ON DELETE SET NULL;

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE metrics_daily
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE sla_configs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE internal_domains
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE company_contacts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Non-partial index required for Supabase upsert onConflict
CREATE UNIQUE INDEX IF NOT EXISTS emails_org_provider_message_uidx
  ON emails (organization_id, provider, gmail_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS threads_org_provider_thread_uidx
  ON threads (organization_id, provider, gmail_thread_id);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_daily_org_date_uidx
  ON metrics_daily (organization_id, date)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sla_configs_org_uidx
  ON sla_configs (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS internal_domains_org_domain_uidx
  ON internal_domains (organization_id, domain)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_contacts_org_email_uidx
  ON company_contacts (organization_id, email)
  WHERE organization_id IS NOT NULL;

-- ── Backfill: one org per existing user with mail data ────────────

DO $$
DECLARE
  u RECORD;
  org_id uuid;
  org_slug text;
  org_name text;
BEGIN
  FOR u IN
    SELECT DISTINCT usr.id, usr.email, usr.name
    FROM users usr
    WHERE EXISTS (
      SELECT 1 FROM mail_connections mc WHERE mc.user_id = usr.id
    )
    OR EXISTS (
      SELECT 1 FROM emails e WHERE e.user_id = usr.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM organization_members om WHERE om.user_id = usr.id
    )
  LOOP
    org_slug := lower(regexp_replace(split_part(u.email, '@', 2), '[^a-z0-9]+', '-', 'g'))
      || '-' || substr(u.id::text, 1, 8);
    org_name := coalesce(u.name, split_part(u.email, '@', 1)) || '''s Organization';

    INSERT INTO organizations (name, slug)
    VALUES (org_name, org_slug)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO org_id;

    IF org_id IS NULL THEN
      SELECT id INTO org_id FROM organizations WHERE slug = org_slug;
    END IF;

    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (org_id, u.id, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    UPDATE mail_connections
    SET organization_id = org_id,
        connected_by_user_id = coalesce(connected_by_user_id, user_id)
    WHERE user_id = u.id AND organization_id IS NULL;

    UPDATE emails SET organization_id = org_id
    WHERE user_id = u.id AND organization_id IS NULL;

    UPDATE threads SET organization_id = org_id
    WHERE user_id = u.id AND organization_id IS NULL;

    UPDATE metrics_daily SET organization_id = org_id
    WHERE user_id = u.id AND organization_id IS NULL;

    UPDATE sla_configs SET organization_id = org_id
    WHERE user_id = u.id AND organization_id IS NULL;

    UPDATE internal_domains SET organization_id = org_id
    WHERE user_id = u.id AND organization_id IS NULL;

    UPDATE company_contacts SET organization_id = org_id
    WHERE user_id = u.id AND organization_id IS NULL;
  END LOOP;
END $$;

-- ── Thread stats trigger: lightweight (reply stats rebuilt after bulk sync) ──

CREATE OR REPLACE FUNCTION refresh_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO threads (
    user_id, organization_id, provider, gmail_thread_id, subject, participants,
    first_received_at, last_message_at, message_count, inbound_count, outbound_count
  )
  VALUES (
    NEW.user_id, NEW.organization_id, NEW.provider, NEW.gmail_thread_id, NEW.subject,
    ARRAY[COALESCE(NEW.from_name || ' <' || NEW.from_address || '>', NEW.from_address)],
    CASE WHEN NOT NEW.is_sent THEN NEW.received_at ELSE NULL END,
    NEW.received_at, 1,
    CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
    CASE WHEN NEW.is_sent THEN 1 ELSE 0 END
  )
  ON CONFLICT DO NOTHING;

  IF NEW.organization_id IS NOT NULL THEN
    UPDATE threads SET
      subject = COALESCE(threads.subject, NEW.subject),
      last_message_at = GREATEST(threads.last_message_at, NEW.received_at),
      message_count = threads.message_count + 1,
      inbound_count = threads.inbound_count + CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
      outbound_count = threads.outbound_count + CASE WHEN NEW.is_sent THEN 1 ELSE 0 END,
      first_received_at = CASE
        WHEN NOT NEW.is_sent THEN
          LEAST(COALESCE(threads.first_received_at, NEW.received_at), NEW.received_at)
        ELSE threads.first_received_at
      END,
      updated_at = now()
    WHERE organization_id = NEW.organization_id
      AND provider = NEW.provider
      AND gmail_thread_id = NEW.gmail_thread_id;
  ELSE
    UPDATE threads SET
      subject = COALESCE(threads.subject, NEW.subject),
      last_message_at = GREATEST(threads.last_message_at, NEW.received_at),
      message_count = threads.message_count + 1,
      inbound_count = threads.inbound_count + CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
      outbound_count = threads.outbound_count + CASE WHEN NEW.is_sent THEN 1 ELSE 0 END,
      first_received_at = CASE
        WHEN NOT NEW.is_sent THEN
          LEAST(COALESCE(threads.first_received_at, NEW.received_at), NEW.received_at)
        ELSE threads.first_received_at
      END,
      updated_at = now()
    WHERE user_id = NEW.user_id
      AND provider = NEW.provider
      AND gmail_thread_id = NEW.gmail_thread_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

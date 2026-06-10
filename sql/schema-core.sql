-- Email Tracker — CORE SCHEMA (run this first)
-- Supabase Dashboard → SQL Editor → New query → paste → Run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABLES ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  name text,
  avatar_url text,
  gmail_access_token text,
  gmail_refresh_token text,
  gmail_token_expiry timestamptz,
  gmail_history_id text,
  team_id uuid,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text NOT NULL,
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] DEFAULT '{}',
  cc_addresses text[] DEFAULT '{}',
  subject text,
  is_sent boolean NOT NULL DEFAULT false,
  is_reply boolean NOT NULL DEFAULT false,
  labels text[] DEFAULT '{}',
  received_at timestamptz NOT NULL,
  UNIQUE (user_id, gmail_message_id)
);

CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_thread_id text NOT NULL,
  subject text,
  participants text[] DEFAULT '{}',
  is_replied boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  first_received_at timestamptz,
  last_message_at timestamptz,
  first_replied_at timestamptz,
  reply_time_seconds integer,
  message_count integer NOT NULL DEFAULT 0,
  inbound_count integer NOT NULL DEFAULT 0,
  outbound_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_thread_id)
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_received integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  new_threads integer NOT NULL DEFAULT 0,
  threads_replied integer NOT NULL DEFAULT 0,
  threads_not_replied integer NOT NULL DEFAULT 0,
  reply_rate numeric(5,2) NOT NULL DEFAULT 0,
  avg_reply_time_sec integer,
  min_reply_time_sec integer,
  max_reply_time_sec integer,
  p50_reply_time_sec integer,
  p90_reply_time_sec integer,
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS sla_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  threshold_hours integer NOT NULL DEFAULT 24,
  notify_email boolean NOT NULL DEFAULT true,
  notify_inapp boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sla_breaches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES sla_configs(id) ON DELETE CASCADE,
  breached_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  is_resolved boolean NOT NULL DEFAULT false
);

-- ── UPDATED_AT ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS threads_updated_at ON threads;
CREATE TRIGGER threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── THREAD STATS TRIGGER ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_thread_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_last_inbound timestamptz;
  v_reply_outbound timestamptz;
  v_reply_secs integer;
BEGIN
  INSERT INTO threads (
    user_id, gmail_thread_id, subject, participants,
    first_received_at, last_message_at, message_count, inbound_count, outbound_count
  )
  VALUES (
    NEW.user_id, NEW.gmail_thread_id, NEW.subject,
    ARRAY[COALESCE(NEW.from_name || ' <' || NEW.from_address || '>', NEW.from_address)],
    CASE WHEN NOT NEW.is_sent THEN NEW.received_at ELSE NULL END,
    NEW.received_at, 1,
    CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
    CASE WHEN NEW.is_sent THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, gmail_thread_id) DO UPDATE SET
    subject = COALESCE(EXCLUDED.subject, threads.subject),
    last_message_at = GREATEST(threads.last_message_at, EXCLUDED.last_message_at),
    message_count = threads.message_count + 1,
    inbound_count = threads.inbound_count + CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
    outbound_count = threads.outbound_count + CASE WHEN NEW.is_sent THEN 1 ELSE 0 END,
    updated_at = now();

  SELECT MAX(received_at) INTO v_last_inbound
  FROM emails WHERE user_id = NEW.user_id AND gmail_thread_id = NEW.gmail_thread_id AND is_sent = false;

  SELECT MIN(received_at) INTO v_reply_outbound
  FROM emails WHERE user_id = NEW.user_id AND gmail_thread_id = NEW.gmail_thread_id AND is_sent = true
    AND v_last_inbound IS NOT NULL AND received_at > v_last_inbound;

  IF v_last_inbound IS NOT NULL AND v_reply_outbound IS NOT NULL THEN
    v_reply_secs := EXTRACT(EPOCH FROM (v_reply_outbound - v_last_inbound))::integer;
  END IF;

  UPDATE threads SET
    first_received_at = v_last_inbound,
    first_replied_at = v_reply_outbound,
    reply_time_seconds = v_reply_secs,
    is_replied = (v_last_inbound IS NOT NULL AND v_reply_outbound IS NOT NULL),
    updated_at = now()
  WHERE user_id = NEW.user_id AND gmail_thread_id = NEW.gmail_thread_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS emails_refresh_thread_stats ON emails;
CREATE TRIGGER emails_refresh_thread_stats
  AFTER INSERT ON emails
  FOR EACH ROW EXECUTE FUNCTION refresh_thread_stats();

-- ── RLS (optional for NextAuth; app uses service role) ─────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_breaches ENABLE ROW LEVEL SECURITY;

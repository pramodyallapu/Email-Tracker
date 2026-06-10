-- Email Tracker — Supabase schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_emails_user_thread ON emails(user_id, gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_user_received ON emails(user_id, received_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_threads_user_last_msg ON threads(user_id, last_message_at DESC);

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

-- ─────────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- REFRESH THREAD STATS (after emails INSERT)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_thread_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_thread_id uuid;
  v_first_inbound timestamptz;
  v_first_outbound_after timestamptz;
  v_reply_secs integer;
BEGIN
  -- Upsert thread row for this gmail_thread_id
  INSERT INTO threads (
    user_id,
    gmail_thread_id,
    subject,
    participants,
    first_received_at,
    last_message_at,
    message_count,
    inbound_count,
    outbound_count
  )
  VALUES (
    NEW.user_id,
    NEW.gmail_thread_id,
    NEW.subject,
    ARRAY[COALESCE(NEW.from_name || ' <' || NEW.from_address || '>', NEW.from_address)],
    CASE WHEN NOT NEW.is_sent THEN NEW.received_at ELSE NULL END,
    NEW.received_at,
    1,
    CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
    CASE WHEN NEW.is_sent THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, gmail_thread_id) DO UPDATE SET
    subject = COALESCE(EXCLUDED.subject, threads.subject),
    last_message_at = GREATEST(threads.last_message_at, EXCLUDED.last_message_at),
    message_count = threads.message_count + 1,
    inbound_count = threads.inbound_count + CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
    outbound_count = threads.outbound_count + CASE WHEN NEW.is_sent THEN 1 ELSE 0 END,
    participants = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(threads.participants || EXCLUDED.participants)
      )
    ),
    updated_at = now()
  RETURNING id INTO v_thread_id;

  -- Recalculate reply stats from all emails in thread
  SELECT MIN(received_at) INTO v_first_inbound
  FROM emails
  WHERE user_id = NEW.user_id
    AND gmail_thread_id = NEW.gmail_thread_id
    AND is_sent = false;

  SELECT MIN(received_at) INTO v_first_outbound_after
  FROM emails
  WHERE user_id = NEW.user_id
    AND gmail_thread_id = NEW.gmail_thread_id
    AND is_sent = true
    AND (v_first_inbound IS NULL OR received_at > v_first_inbound);

  IF v_first_inbound IS NOT NULL AND v_first_outbound_after IS NOT NULL THEN
    v_reply_secs := EXTRACT(EPOCH FROM (v_first_outbound_after - v_first_inbound))::integer;
  ELSE
    v_reply_secs := NULL;
  END IF;

  UPDATE threads SET
    first_received_at = v_first_inbound,
    first_replied_at = v_first_outbound_after,
    reply_time_seconds = v_reply_secs,
    is_replied = (v_first_outbound_after IS NOT NULL),
    updated_at = now()
  WHERE user_id = NEW.user_id
    AND gmail_thread_id = NEW.gmail_thread_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER emails_refresh_thread_stats
  AFTER INSERT ON emails
  FOR EACH ROW EXECUTE FUNCTION refresh_thread_stats();

-- ─────────────────────────────────────────────────────────────────
-- DAILY METRICS AGGREGATION
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION aggregate_metrics_daily(p_date date DEFAULT (CURRENT_DATE - INTERVAL '1 day')::date)
RETURNS void AS $$
BEGIN
  INSERT INTO metrics_daily (
    user_id,
    date,
    total_received,
    total_sent,
    new_threads,
    threads_replied,
    threads_not_replied,
    reply_rate,
    avg_reply_time_sec,
    min_reply_time_sec,
    max_reply_time_sec,
    p50_reply_time_sec,
    p90_reply_time_sec
  )
  SELECT
    u.id AS user_id,
    p_date AS date,
    COALESCE(recv.cnt, 0) AS total_received,
    COALESCE(sent.cnt, 0) AS total_sent,
    COALESCE(new_t.cnt, 0) AS new_threads,
    COALESCE(replied.cnt, 0) AS threads_replied,
    COALESCE(not_replied.cnt, 0) AS threads_not_replied,
    CASE
      WHEN COALESCE(replied.cnt, 0) + COALESCE(not_replied.cnt, 0) = 0 THEN 0
      ELSE ROUND(
        (COALESCE(replied.cnt, 0)::numeric / (replied.cnt + not_replied.cnt)) * 100,
        2
      )
    END AS reply_rate,
    reply_stats.avg_sec,
    reply_stats.min_sec,
    reply_stats.max_sec,
    reply_stats.p50_sec,
    reply_stats.p90_sec
  FROM users u
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS cnt
    FROM emails e
    WHERE e.user_id = u.id
      AND e.is_sent = false
      AND e.received_at::date = p_date
  ) recv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS cnt
    FROM emails e
    WHERE e.user_id = u.id
      AND e.is_sent = true
      AND e.received_at::date = p_date
  ) sent ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS cnt
    FROM threads t
    WHERE t.user_id = u.id
      AND t.created_at::date = p_date
  ) new_t ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS cnt
    FROM threads t
    WHERE t.user_id = u.id
      AND t.is_replied = true
      AND t.first_replied_at::date = p_date
  ) replied ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS cnt
    FROM threads t
    WHERE t.user_id = u.id
      AND t.is_replied = false
      AND t.last_message_at::date <= p_date
  ) not_replied ON true
  LEFT JOIN LATERAL (
    SELECT
      AVG(reply_time_seconds)::integer AS avg_sec,
      MIN(reply_time_seconds) AS min_sec,
      MAX(reply_time_seconds) AS max_sec,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY reply_time_seconds)::integer AS p50_sec,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY reply_time_seconds)::integer AS p90_sec
    FROM threads t
    WHERE t.user_id = u.id
      AND t.reply_time_seconds IS NOT NULL
      AND t.first_replied_at::date = p_date
  ) reply_stats ON true
  ON CONFLICT (user_id, date) DO UPDATE SET
    total_received = EXCLUDED.total_received,
    total_sent = EXCLUDED.total_sent,
    new_threads = EXCLUDED.new_threads,
    threads_replied = EXCLUDED.threads_replied,
    threads_not_replied = EXCLUDED.threads_not_replied,
    reply_rate = EXCLUDED.reply_rate,
    avg_reply_time_sec = EXCLUDED.avg_reply_time_sec,
    min_reply_time_sec = EXCLUDED.min_reply_time_sec,
    max_reply_time_sec = EXCLUDED.max_reply_time_sec,
    p50_reply_time_sec = EXCLUDED.p50_reply_time_sec,
    p90_reply_time_sec = EXCLUDED.p90_reply_time_sec;

END;
$$ LANGUAGE plpgsql;

-- pg_cron: daily at 00:05 UTC
SELECT cron.schedule(
  'aggregate-metrics-daily',
  '5 0 * * *',
  $$SELECT aggregate_metrics_daily((CURRENT_DATE - INTERVAL '1 day')::date)$$
);

-- ─────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_breaches ENABLE ROW LEVEL SECURITY;

-- users: own row only
CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY users_insert_own ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- emails
CREATE POLICY emails_select_own ON emails
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY emails_insert_own ON emails
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY emails_update_own ON emails
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY emails_delete_own ON emails
  FOR DELETE USING (auth.uid() = user_id);

-- threads
CREATE POLICY threads_select_own ON threads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY threads_insert_own ON threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY threads_update_own ON threads
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY threads_delete_own ON threads
  FOR DELETE USING (auth.uid() = user_id);

-- metrics_daily
CREATE POLICY metrics_daily_select_own ON metrics_daily
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY metrics_daily_insert_own ON metrics_daily
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY metrics_daily_update_own ON metrics_daily
  FOR UPDATE USING (auth.uid() = user_id);

-- sla_configs
CREATE POLICY sla_configs_select_own ON sla_configs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sla_configs_all_own ON sla_configs
  FOR ALL USING (auth.uid() = user_id);

-- sla_breaches
CREATE POLICY sla_breaches_select_own ON sla_breaches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sla_breaches_all_own ON sla_breaches
  FOR ALL USING (auth.uid() = user_id);

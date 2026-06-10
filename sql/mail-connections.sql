-- Multi-mailbox support: Google + Zoho on one account
-- Run in Supabase SQL Editor AFTER schema-core.sql

CREATE TABLE IF NOT EXISTS mail_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'zoho')),
  mailbox_email text NOT NULL,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  sync_cursor text,
  zoho_account_id text,
  zoho_dc text DEFAULT 'com',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_mail_connections_user ON mail_connections(user_id);

-- Tag emails/threads by provider (google | zoho)
ALTER TABLE emails ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'google';
ALTER TABLE threads ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'google';

ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_user_id_gmail_message_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS emails_user_provider_message_uidx
  ON emails (user_id, provider, gmail_message_id);

ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_user_id_gmail_thread_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS threads_user_provider_thread_uidx
  ON threads (user_id, provider, gmail_thread_id);

-- Update thread stats trigger to scope by provider
CREATE OR REPLACE FUNCTION refresh_thread_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_last_inbound timestamptz;
  v_reply_outbound timestamptz;
  v_reply_secs integer;
  v_from_name text;
  v_from_address text;
BEGIN
  INSERT INTO threads (
    user_id, provider, gmail_thread_id, subject, participants,
    first_received_at, last_message_at, message_count, inbound_count, outbound_count
  )
  VALUES (
    NEW.user_id, NEW.provider, NEW.gmail_thread_id, NEW.subject,
    ARRAY[COALESCE(NEW.from_name || ' <' || NEW.from_address || '>', NEW.from_address)],
    CASE WHEN NOT NEW.is_sent THEN NEW.received_at ELSE NULL END,
    NEW.received_at, 1,
    CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
    CASE WHEN NEW.is_sent THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, provider, gmail_thread_id) DO UPDATE SET
    subject = COALESCE(EXCLUDED.subject, threads.subject),
    last_message_at = GREATEST(threads.last_message_at, EXCLUDED.last_message_at),
    message_count = threads.message_count + 1,
    inbound_count = threads.inbound_count + CASE WHEN NOT NEW.is_sent THEN 1 ELSE 0 END,
    outbound_count = threads.outbound_count + CASE WHEN NEW.is_sent THEN 1 ELSE 0 END,
    updated_at = now();

  SELECT MAX(received_at) INTO v_last_inbound
  FROM emails
  WHERE user_id = NEW.user_id AND provider = NEW.provider
    AND gmail_thread_id = NEW.gmail_thread_id AND is_sent = false;

  SELECT MIN(received_at) INTO v_reply_outbound
  FROM emails
  WHERE user_id = NEW.user_id AND provider = NEW.provider
    AND gmail_thread_id = NEW.gmail_thread_id AND is_sent = true
    AND v_last_inbound IS NOT NULL AND received_at > v_last_inbound;

  IF v_last_inbound IS NOT NULL AND v_reply_outbound IS NOT NULL THEN
    v_reply_secs := EXTRACT(EPOCH FROM (v_reply_outbound - v_last_inbound))::integer;
  END IF;

  SELECT from_name, from_address
  INTO v_from_name, v_from_address
  FROM emails
  WHERE user_id = NEW.user_id AND provider = NEW.provider
    AND gmail_thread_id = NEW.gmail_thread_id AND is_sent = false
  ORDER BY received_at ASC
  LIMIT 1;

  UPDATE threads SET
    first_received_at = v_last_inbound,
    first_replied_at = v_reply_outbound,
    reply_time_seconds = v_reply_secs,
    is_replied = (v_last_inbound IS NOT NULL AND v_reply_outbound IS NOT NULL),
    participants = CASE
      WHEN v_from_address IS NOT NULL THEN
        ARRAY[COALESCE(v_from_name || ' <' || v_from_address || '>', v_from_address)]
      ELSE threads.participants
    END,
    updated_at = now()
  WHERE user_id = NEW.user_id AND provider = NEW.provider
    AND gmail_thread_id = NEW.gmail_thread_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reply time: measure from latest inbound to your reply after it
-- Run in Supabase SQL Editor if mail was already synced with the old logic

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

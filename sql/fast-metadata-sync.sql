-- Faster bulk metadata sync: lightweight thread trigger (no per-row email scans).
-- Reply-time stats are rebuilt once when full sync finishes (rebuildThreadStats).
-- Run in Supabase SQL Editor after organizations.sql.

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

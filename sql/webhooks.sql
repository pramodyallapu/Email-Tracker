-- Database webhooks documentation
-- Configure in Supabase Dashboard → Database → Webhooks

-- 1. process-email (on emails INSERT)
--    Table: emails
--    Events: INSERT
--    Type: Supabase Edge Function
--    Function: process-email
--    HTTP Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>

-- 2. Optional: aggregate-metrics (scheduled via pg_cron or Vercel cron)
--    Calls Edge Function: aggregate-metrics
--    Or use SQL: SELECT aggregate_metrics_daily();

-- Manual setup steps:
-- 1. Deploy Edge Functions: supabase functions deploy process-email
-- 2. Deploy: supabase functions deploy aggregate-metrics
-- 3. Create webhook for emails INSERT → process-email
-- 4. Enable Realtime on notifications table for live updates

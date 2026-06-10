# Email Tracker — Deployment Checklist

## Pre-deployment

- [ ] Run `sql/schema.sql` in Supabase SQL Editor
- [ ] Run `sql/notifications.sql` in Supabase SQL Editor
- [ ] Run `sql/teams.sql` after schema (team FK on users)
- [ ] Enable **pg_cron** extension in Supabase (Database → Extensions)
- [ ] Regenerate types:
  ```bash
  npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts
  ```
- [ ] Set up Google Cloud project and enable **Gmail API**
- [ ] Create OAuth 2.0 credentials (Web application)
- [ ] Add redirect URI: `https://yourdomain.com/api/auth/callback/google`
- [ ] Set up Google Cloud Pub/Sub topic + push subscription
- [ ] Push endpoint: `https://yourdomain.com/api/gmail/webhook`
- [ ] Deploy Supabase Edge Functions:
  ```bash
  supabase functions deploy process-email
  supabase functions deploy aggregate-metrics
  ```
- [ ] Create Database Webhook (see `sql/webhooks.sql`)
- [ ] Enable Realtime on `notifications` table
- [ ] Set all environment variables in Vercel (see `.env.local`)
- [ ] Deploy to Vercel

## Environment variables

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server only) |
| `NEXTAUTH_URL` | Yes |
| `NEXTAUTH_SECRET` | Yes |
| `GOOGLE_CLIENT_ID` | Yes |
| `GOOGLE_CLIENT_SECRET` | Yes |
| `GOOGLE_PUBSUB_SECRET` | Yes (webhook auth) |
| `CRON_SECRET` | Yes (Vercel cron) |
| `INTERNAL_API_SECRET` | Yes (internal sync triggers) |
| `RESEND_API_KEY` | Optional (email alerts) |

## Post-deploy verification

1. Sign in with Google → user row created in Supabase
2. Initial sync runs → emails populate
3. Dashboard KPIs load
4. Inbox shows threads with status badges
5. Configure SLA in Settings
6. Vercel cron hits `GET /api/gmail/sync` every 15 minutes

## Final checks (local)

```bash
npx tsc --noEmit
npx eslint src --max-warnings 0
```

Test full flow: sign in → sync → dashboard → inbox → SLA settings → team invite (if applicable).

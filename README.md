# Email Tracker

SaaS app for tracking Gmail reply times, response rates, and SLA metrics. Built with Next.js 14, Supabase, NextAuth.js v5, and the Gmail API.

## Getting started

1. Copy environment variables:

   ```bash
   cp .env.local.example .env.local
   ```

   Or edit `.env.local` directly and fill in all values.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Type-check:

   ```bash
   npm run typecheck
   ```

## Stack

- Next.js 14 (App Router) + TypeScript strict
- Supabase (Postgres + RLS)
- NextAuth.js v5 (Google OAuth + Gmail scope)
- Tailwind CSS + Recharts
- Vercel cron (`/api/gmail/sync` every 15 min)

## Project structure

See `src/app`, `src/lib`, `src/components`, and `src/types` for the scaffold layout defined in Phase 1.

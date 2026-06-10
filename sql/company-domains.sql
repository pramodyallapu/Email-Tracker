-- Company domain labels for per-company reports
-- Run in Supabase SQL Editor after schema-core.sql

CREATE TABLE IF NOT EXISTS company_domains (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  company_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_company_domains_user ON company_domains(user_id);

ALTER TABLE company_domains ENABLE ROW LEVEL SECURITY;

-- Company contacts: map full email addresses to company names
-- Run in Supabase SQL Editor after schema-core.sql

CREATE TABLE IF NOT EXISTS company_contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_company_contacts_user ON company_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_company ON company_contacts(user_id, company_name);

ALTER TABLE company_contacts ENABLE ROW LEVEL SECURITY;

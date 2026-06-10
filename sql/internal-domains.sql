-- Internal domain mapping (classify sent/received mail as internal vs external)
-- Run in Supabase SQL Editor after schema-core.sql

CREATE TABLE IF NOT EXISTS internal_domains (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_internal_domains_user ON internal_domains(user_id);

ALTER TABLE internal_domains ENABLE ROW LEVEL SECURITY;

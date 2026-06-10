-- Phase 7 — Team workspace tables

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  token uuid NOT NULL DEFAULT uuid_generate_v4(),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);

-- users.team_id FK (if not already present)
ALTER TABLE users
  ADD CONSTRAINT users_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

-- Team members can view team
CREATE POLICY teams_select_member ON teams
  FOR SELECT USING (
    id IN (SELECT team_id FROM users WHERE id = auth.uid())
  );

-- Team members can see teammates' daily metrics
CREATE POLICY metrics_daily_team_select ON metrics_daily
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users
      WHERE team_id = (SELECT team_id FROM users WHERE id = auth.uid())
    )
  );

-- Team members can view each other's basic profile
CREATE POLICY users_team_select ON users
  FOR SELECT USING (
    team_id IS NOT NULL
    AND team_id = (SELECT team_id FROM users WHERE id = auth.uid())
  );

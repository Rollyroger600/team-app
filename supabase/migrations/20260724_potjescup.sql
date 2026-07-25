-- Potjescup: per-training scrimmage points, tracked per player, feeding a season leaderboard.

CREATE TABLE IF NOT EXISTS potjescup_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS potjescup_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES potjescup_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points NUMERIC(3,1) NOT NULL DEFAULT 0 CHECK (points IN (0, 0.5, 1)),
  UNIQUE (session_id, player_id)
);

ALTER TABLE potjescup_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE potjescup_scores   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view potjescup sessions" ON potjescup_sessions;
CREATE POLICY "Team members can view potjescup sessions"
  ON potjescup_sessions FOR SELECT USING (is_team_member(team_id));

DROP POLICY IF EXISTS "Team admins can manage potjescup sessions" ON potjescup_sessions;
CREATE POLICY "Team admins can manage potjescup sessions"
  ON potjescup_sessions FOR ALL USING (is_team_admin(team_id) OR is_club_admin_for_team(team_id));

DROP POLICY IF EXISTS "Team members can view potjescup scores" ON potjescup_scores;
CREATE POLICY "Team members can view potjescup scores"
  ON potjescup_scores FOR SELECT USING (
    is_team_member((SELECT team_id FROM potjescup_sessions WHERE id = session_id))
  );

DROP POLICY IF EXISTS "Team admins can manage potjescup scores" ON potjescup_scores;
CREATE POLICY "Team admins can manage potjescup scores"
  ON potjescup_scores FOR ALL USING (
    is_team_admin((SELECT team_id FROM potjescup_sessions WHERE id = session_id))
    OR is_club_admin_for_team((SELECT team_id FROM potjescup_sessions WHERE id = session_id))
  );

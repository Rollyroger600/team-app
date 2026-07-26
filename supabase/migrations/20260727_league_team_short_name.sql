-- Opponent club names imported from the registry (e.g. "Klein Zwitserland (H.C.)
-- Heren 30-1") are too long for the compact standings/schedule UI. Add an optional
-- short_name that admins can set per league_team; the app falls back to team_name
-- wherever it isn't set.
ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS short_name TEXT;

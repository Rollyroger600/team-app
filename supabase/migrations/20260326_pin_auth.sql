-- ============================================================
-- Migration: PIN-based Auth + RBAC
-- Apply this on the live Supabase database via SQL editor
-- ============================================================

-- 1. profiles: add display_name and nickname (if not already present)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname     TEXT;

-- 2. Slugs for URL-based team selection
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- 3. Availability override columns
ALTER TABLE match_availability ADD COLUMN IF NOT EXISTS set_by        UUID REFERENCES profiles(id);
ALTER TABLE match_availability ADD COLUMN IF NOT EXISTS overridden    BOOLEAN DEFAULT false;
ALTER TABLE match_availability ADD COLUMN IF NOT EXISTS override_note TEXT;

-- 4. Player credentials table (secrets never exposed via RLS)
CREATE TABLE IF NOT EXISTS player_credentials (
  player_id          UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  internal_email     TEXT UNIQUE NOT NULL,   -- "{uuid}@team.internal" — never shown to user
  internal_password  TEXT NOT NULL,          -- random 32-char — used by Edge Fn to obtain Supabase session
  pin_hash           TEXT,                   -- bcrypt hash — NULL until player sets PIN
  has_set_pin        BOOLEAN DEFAULT false,
  failed_attempts    INT DEFAULT 0,
  locked_until       TIMESTAMPTZ            -- NULL = not locked
);

ALTER TABLE player_credentials ENABLE ROW LEVEL SECURITY;
-- Block ALL direct client access — only accessible via service role key in Edge Functions
DROP POLICY IF EXISTS "No direct access" ON player_credentials;
CREATE POLICY "No direct access" ON player_credentials FOR ALL USING (false);

-- 5. New helper: is_club_admin_for_team
CREATE OR REPLACE FUNCTION is_club_admin_for_team(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_memberships cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE cm.player_id = auth.uid()
      AND t.id = p_team_id
      AND cm.role = 'club_admin'
  ) OR is_platform_admin();
$$;

-- 6. Allow unauthenticated read of clubs and teams (needed for login team selection)
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;
CREATE POLICY "Anyone can view clubs"
  ON clubs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Team members can view their team" ON teams;
CREATE POLICY "Anyone can view teams"
  ON teams FOR SELECT USING (true);

-- 7. Allow team admins to set/override availability for other players
DROP POLICY IF EXISTS "Team admins can manage all availability" ON match_availability;
CREATE POLICY "Team admins can manage all availability"
  ON match_availability FOR ALL
  USING (
    is_team_admin((SELECT team_id FROM matches WHERE id = match_availability.match_id))
    OR is_platform_admin()
  );

-- 8. Allow unauthenticated read of profiles display_name + jersey_number for login name picker
--    (only via a SECURITY DEFINER RPC — not direct table access)
--    Profiles table RLS remains unchanged (no SELECT for anon)

-- 9. Update handle_new_user trigger to include display_name from metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, display_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC for login name picker (accessible unauthenticated via Edge Function service role)
--     Called by auth-handler get_players_for_login — not exposed directly to clients
CREATE OR REPLACE FUNCTION get_team_players_for_login(p_team_id UUID)
RETURNS TABLE (player_id UUID, display_name TEXT, jersey_number SMALLINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, COALESCE(p.display_name, p.full_name, p.nickname) AS display_name, p.jersey_number
  FROM profiles p
  JOIN team_memberships tm ON tm.player_id = p.id
  WHERE tm.team_id = p_team_id AND tm.active = true
  ORDER BY p.jersey_number ASC NULLS LAST, p.display_name ASC;
$$;

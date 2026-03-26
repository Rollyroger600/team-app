-- ============================================================
-- Hockey Team App – Complete Database Schema v2
-- Inclusief clubs_registry: gedeelde kennisbank van alle clubs
-- ============================================================

-- ============================================================
-- 1. CLUBS REGISTRY (gedeelde kennisbank, platform-breed)
-- ============================================================
-- Elke hockeyclub die ooit in een poule voorkomt wordt hier opgeslagen.
-- Eenmalig invullen → overal hergebruiken. Als HC Roomburg al bekend is,
-- hoeft niemand het adres opnieuw in te vullen.
CREATE TABLE IF NOT EXISTS clubs_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,              -- "HC Roomburg"
  short_name      TEXT,                       -- "HCR" (optioneel)
  street_address  TEXT,                       -- "Sportlaan 5"
  postcode        TEXT,                       -- "2321 AB"
  city            TEXT,                       -- "Leiden"
  address         TEXT,                       -- volledig adres (legacy / gecombineerd)
  latitude        DOUBLE PRECISION,           -- geocoded bij aanmaken
  longitude       DOUBLE PRECISION,
  primary_color   TEXT,                       -- optionele clubkleur 1
  secondary_color TEXT,                       -- optionele clubkleur 2
  logo_url        TEXT,
  website         TEXT,
  verified        BOOLEAN DEFAULT false,      -- door platform_admin geverifieerd
  created_by      UUID,                       -- wie heeft het toegevoegd (FK later)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (name)                               -- één entry per clubnaam
);

-- ============================================================
-- 2. CLUBS (jouw eigen club — tenant)
-- ============================================================
-- Dit is de "eigen club" binnen het platform (bijv. HC Leiden).
-- Koppelt aan clubs_registry voor gedeelde data, maar kan kleuren
-- en instellingen zelf beheren.
CREATE TABLE IF NOT EXISTS clubs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id     UUID REFERENCES clubs_registry(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,              -- "HC Leiden" (kan afwijken van registry)
  short_name      TEXT,
  slug            TEXT UNIQUE,               -- URL slug voor login team-selectie (bijv. "hcleiden")
  -- Kleuren voor app-theming (overschrijft registry kleuren)
  primary_color   TEXT DEFAULT '#1e3a5f',
  secondary_color TEXT DEFAULT '#f59e0b',
  logo_url        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- FK terug naar clubs_registry: created_by
ALTER TABLE clubs_registry DROP CONSTRAINT IF EXISTS fk_registry_created_by;
ALTER TABLE clubs_registry
  ADD CONSTRAINT fk_registry_created_by
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 3. TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                 UUID REFERENCES clubs(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,              -- "Heren 30-1"
  short_name              TEXT,
  slug                    TEXT UNIQUE,               -- URL slug voor login (bijv. "heren30-1")
  season                  TEXT DEFAULT '2025-2026',
  league_id               UUID,                       -- FK toegevoegd na leagues
  -- Verzameltijd instellingen (aanpasbaar door team_admin)
  gathering_lead_time     INT DEFAULT 30,             -- minuten voor aanvang verzamelen
  travel_buffer_minutes   INT DEFAULT 10,             -- extra buffer bovenop reistijd
  match_squad_size        INT DEFAULT 16,             -- max spelers per wedstrijd
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  full_name         TEXT,
  display_name      TEXT,           -- weergavenaam in de app (bijv. voornaam), gebruikt op login scherm
  nickname          TEXT,           -- bijnaam (optioneel)
  phone             TEXT,
  jersey_number     SMALLINT,
  position          TEXT,           -- 'goalkeeper', 'defender', 'midfielder', 'forward'
  is_platform_admin BOOLEAN DEFAULT false,
  avatar_url        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4b. PLAYER CREDENTIALS (PIN auth — nooit via RLS toegankelijk)
-- ============================================================
CREATE TABLE IF NOT EXISTS player_credentials (
  player_id          UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  internal_email     TEXT UNIQUE NOT NULL,   -- "{uuid}@team.internal" — nooit aan gebruiker getoond
  internal_password  TEXT NOT NULL,          -- random 32-char — Edge Fn gebruikt dit om Supabase sessie op te halen
  pin_hash           TEXT,                   -- bcrypt hash — NULL totdat speler PIN instelt
  has_set_pin        BOOLEAN DEFAULT false,
  failed_attempts    INT DEFAULT 0,
  locked_until       TIMESTAMPTZ            -- NULL = niet geblokkeerd
);

ALTER TABLE player_credentials ENABLE ROW LEVEL SECURITY;
-- Blokkeert ALLE directe client toegang — alleen via service role key in Edge Functions
CREATE POLICY "No direct access" ON player_credentials FOR ALL USING (false);

-- ============================================================
-- 5. TEAM MEMBERSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS team_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'player',   -- 'player' | 'team_admin'
  active      BOOLEAN DEFAULT true,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (team_id, player_id)
);

-- ============================================================
-- 6. CLUB MEMBERSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS club_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',   -- 'member' | 'club_admin'
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (club_id, player_id)
);

-- ============================================================
-- 7. LEAGUES (poules / competities)
-- ============================================================
CREATE TABLE IF NOT EXISTS leagues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,    -- "3e klasse KNHB voorjaar 2026"
  season      TEXT,             -- "2025-2026"
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- FK van teams naar leagues
ALTER TABLE teams DROP CONSTRAINT IF EXISTS fk_teams_league;
ALTER TABLE teams
  ADD CONSTRAINT fk_teams_league
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE SET NULL;

-- ============================================================
-- 8. LEAGUE TEAMS (alle teams in de poule)
-- ============================================================
-- Elke poule-entry koppelt aan clubs_registry voor locatiedata.
-- Als de club al bekend is → adres/coördinaten automatisch ingevuld.
-- Als niet → gebruiker wordt gevraagd adres in te vullen (wordt dan
-- opgeslagen in clubs_registry voor hergebruik).
CREATE TABLE IF NOT EXISTS league_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,  -- eigen team (nullable)
  registry_id     UUID REFERENCES clubs_registry(id) ON DELETE SET NULL,
  team_name       TEXT NOT NULL,    -- "HC Roomburg 1" (volledig teamnaam)
  is_own_team     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (league_id, team_name)
);

-- ============================================================
-- 9. LEAGUE MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS league_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  home_team_id    UUID REFERENCES league_teams(id) ON DELETE SET NULL,
  away_team_id    UUID REFERENCES league_teams(id) ON DELETE SET NULL,
  match_date      DATE,               -- null = datum onbekend
  match_time      TIME,               -- null = NTB (nog niet bekend)
  matchday        SMALLINT,           -- speelronde nummer
  score_home      SMALLINT,
  score_away      SMALLINT,
  status          TEXT DEFAULT 'upcoming',  -- 'upcoming' | 'completed' | 'cancelled'
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. MATCHES (eigen wedstrijdschema met alle details)
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_match_id           UUID REFERENCES league_matches(id) ON DELETE SET NULL,
  opponent                  TEXT NOT NULL,
  match_date                DATE NOT NULL,
  match_time                TIME,                   -- null = NTB
  is_home                   BOOLEAN NOT NULL DEFAULT true,
  location                  TEXT,                   -- uitwedstrijd adres (overschrijft registry)
  location_lat              DOUBLE PRECISION,
  location_lng              DOUBLE PRECISION,
  registry_id               UUID REFERENCES clubs_registry(id) ON DELETE SET NULL,
  travel_duration_minutes   INT,                    -- gecached van ORS API
  gathering_time            TIME,                   -- berekende verzameltijd
  gathering_time_override   TIME,                   -- handmatige admin override
  gathering_note            TEXT,                   -- bijv. "Rechtstreeks naar veld"
  score_home                SMALLINT,
  score_away                SMALLINT,
  status                    TEXT DEFAULT 'upcoming',
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 11. MATCH AVAILABILITY
-- ============================================================
CREATE TABLE IF NOT EXISTS match_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'unknown',  -- 'available' | 'unavailable' | 'maybe' | 'unknown'
  note          TEXT,
  responded_at  TIMESTAMPTZ,
  set_by        UUID REFERENCES profiles(id),     -- admin die status heeft overschreven (NULL = eigen opgave)
  overridden    BOOLEAN DEFAULT false,             -- true = door admin overschreven
  override_note TEXT,                             -- optionele reden van admin
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (match_id, player_id)
);

-- ============================================================
-- 12. MATCH ROSTER (selectie + opstelling)
-- ============================================================
CREATE TABLE IF NOT EXISTS match_roster (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  roster_status       TEXT DEFAULT 'starting',  -- 'starting' | 'bench' | 'rostered_off'
  position_in_lineup  TEXT,        -- "GK", "LB", "CB", "RB", "LM", "CM", "RM", "LA", "CA", "RA"
  rostered_off_reason TEXT,
  sort_order          SMALLINT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (match_id, player_id)
);

-- ============================================================
-- 13. GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  scorer_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assist_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  minute        SMALLINT,
  is_own_goal          BOOLEAN DEFAULT false,
  is_penalty           BOOLEAN DEFAULT false,
  is_penalty_corner    BOOLEAN DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 14. UMPIRE DUTIES (fluitbeurten)
-- ============================================================
CREATE TABLE IF NOT EXISTS umpire_duties (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  match_id            UUID REFERENCES matches(id) ON DELETE SET NULL,
  player_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  umpire_match_desc   TEXT NOT NULL,   -- "Dames 3 vs HC Roomburg"
  umpire_time         TIME,
  status              TEXT DEFAULT 'assigned',  -- 'assigned' | 'confirmed' | 'swapped'
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 15. ANNOUNCEMENTS (berichten / weekberichten)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  match_id    UUID REFERENCES matches(id) ON DELETE SET NULL,
  author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title       TEXT,
  body        TEXT NOT NULL,
  pinned      BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clubs_registry_name        ON clubs_registry(name);
CREATE INDEX IF NOT EXISTS idx_matches_team_date          ON matches(team_id, match_date);
CREATE INDEX IF NOT EXISTS idx_match_availability_match   ON match_availability(match_id);
CREATE INDEX IF NOT EXISTS idx_match_availability_player  ON match_availability(player_id);
CREATE INDEX IF NOT EXISTS idx_match_roster_match         ON match_roster(match_id);
CREATE INDEX IF NOT EXISTS idx_goals_match                ON goals(match_id);
CREATE INDEX IF NOT EXISTS idx_goals_scorer               ON goals(scorer_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_player    ON team_memberships(player_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_registry      ON league_teams(registry_id);
CREATE INDEX IF NOT EXISTS idx_announcements_team         ON announcements(team_id, created_at DESC);

-- ============================================================
-- VIEWS
-- ============================================================

-- Competitiestand (automatisch berekend uit league_matches)
CREATE OR REPLACE VIEW v_league_standings AS
SELECT
  lt.league_id,
  lt.id           AS league_team_id,
  lt.team_id,
  lt.team_name,
  lt.is_own_team,
  cr.primary_color,
  COUNT(lm.id)    AS played,
  SUM(CASE
    WHEN (lt.id = lm.home_team_id AND lm.score_home > lm.score_away)
      OR (lt.id = lm.away_team_id AND lm.score_away > lm.score_home)
    THEN 1 ELSE 0 END) AS wins,
  SUM(CASE
    WHEN lm.score_home = lm.score_away THEN 1 ELSE 0 END) AS draws,
  SUM(CASE
    WHEN (lt.id = lm.home_team_id AND lm.score_home < lm.score_away)
      OR (lt.id = lm.away_team_id AND lm.score_away < lm.score_home)
    THEN 1 ELSE 0 END) AS losses,
  SUM(CASE
    WHEN lt.id = lm.home_team_id THEN COALESCE(lm.score_home, 0)
    ELSE COALESCE(lm.score_away, 0) END) AS goals_for,
  SUM(CASE
    WHEN lt.id = lm.home_team_id THEN COALESCE(lm.score_away, 0)
    ELSE COALESCE(lm.score_home, 0) END) AS goals_against,
  SUM(CASE
    WHEN (lt.id = lm.home_team_id AND lm.score_home > lm.score_away)
      OR (lt.id = lm.away_team_id AND lm.score_away > lm.score_home)
    THEN 3
    WHEN lm.score_home = lm.score_away THEN 1
    ELSE 0 END) AS points
FROM league_teams lt
LEFT JOIN clubs_registry cr ON cr.id = lt.registry_id
LEFT JOIN league_matches lm
  ON (lm.home_team_id = lt.id OR lm.away_team_id = lt.id)
  AND lm.status = 'completed'
GROUP BY lt.league_id, lt.id, lt.team_id, lt.team_name, lt.is_own_team, cr.primary_color;

-- Speler statistieken
-- NOTE: goals and assists use separate LEFT JOINs to avoid cross-join inflation
-- with match_availability/match_roster rows.
CREATE OR REPLACE VIEW v_player_stats AS
SELECT
  p.id            AS player_id,
  p.full_name,
  tm.team_id,
  COUNT(DISTINCT mr.match_id) FILTER (
    WHERE mr.roster_status IN ('starting', 'bench')
  ) AS matches_played,
  COUNT(DISTINCT mr.match_id) FILTER (
    WHERE mr.roster_status = 'rostered_off'
  ) AS times_rostered_off,
  COUNT(DISTINCT ma.match_id) FILTER (
    WHERE ma.status = 'available'
  ) AS times_available,
  COUNT(DISTINCT ma.match_id) FILTER (
    WHERE ma.status = 'unavailable'
  ) AS times_unavailable,
  COUNT(DISTINCT g_scored.id) AS goals,
  COUNT(DISTINCT g_assist.id) AS assists,
  COALESCE(ud.umpire_count, 0) AS umpire_duties
FROM profiles p
JOIN team_memberships tm ON tm.player_id = p.id AND tm.active = true
LEFT JOIN match_roster mr ON mr.player_id = p.id
LEFT JOIN match_availability ma ON ma.player_id = p.id
LEFT JOIN goals g_scored ON g_scored.scorer_id = p.id AND NOT g_scored.is_own_goal
LEFT JOIN goals g_assist ON g_assist.assist_id = p.id
LEFT JOIN (
  SELECT player_id, COUNT(*) AS umpire_count
  FROM umpire_duties
  GROUP BY player_id
) ud ON ud.player_id = p.id
GROUP BY p.id, p.full_name, tm.team_id, ud.umpire_count;

-- ============================================================
-- AUTO-CREATE PROFILE BIJ SIGNUP
-- ============================================================
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_clubs_registry_updated_at ON clubs_registry;
CREATE TRIGGER trg_clubs_registry_updated_at
  BEFORE UPDATE ON clubs_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_matches_updated_at ON matches;
CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE clubs_registry    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues           ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_teams      ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_matches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_roster      ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE umpire_duties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements     ENABLE ROW LEVEL SECURITY;

-- Drop alle bestaande policies zodat het script herhaaldelijk kan worden uitgevoerd
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---- Helper functions ----
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE team_id = p_team_id AND player_id = auth.uid() AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE team_id = p_team_id AND player_id = auth.uid()
      AND role = 'team_admin' AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

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

-- RPC: geeft spelersnamen terug voor login naam-picker (unauthenticated via Edge Function service role)
CREATE OR REPLACE FUNCTION get_team_players_for_login(p_team_id UUID)
RETURNS TABLE (player_id UUID, display_name TEXT, jersey_number SMALLINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, COALESCE(p.display_name, p.full_name, p.nickname) AS display_name, p.jersey_number
  FROM profiles p
  JOIN team_memberships tm ON tm.player_id = p.id
  WHERE tm.team_id = p_team_id AND tm.active = true
  ORDER BY p.jersey_number ASC NULLS LAST, display_name ASC;
$$;

-- ---- CLUBS REGISTRY ----
-- Iedereen kan clubs opzoeken (voor autocomplete bij poule-invoer)
CREATE POLICY "Authenticated users can view clubs registry"
  ON clubs_registry FOR SELECT USING (auth.role() = 'authenticated');

-- Iedereen kan nieuwe clubs toevoegen aan de registry
CREATE POLICY "Authenticated users can add to clubs registry"
  ON clubs_registry FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Alleen de aanmaker of platform admin mag updaten
CREATE POLICY "Creator or platform admin can update registry"
  ON clubs_registry FOR UPDATE USING (
    created_by = auth.uid() OR is_platform_admin()
  );

CREATE POLICY "Platform admins can delete from registry"
  ON clubs_registry FOR DELETE USING (is_platform_admin());

-- ---- PROFILES ----
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "Team members can view each other's profiles"
  ON profiles FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_memberships tm1
      JOIN team_memberships tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.player_id = auth.uid() AND tm2.player_id = profiles.id
        AND tm1.active = true AND tm2.active = true
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Platform admins can manage all profiles"
  ON profiles FOR ALL USING (is_platform_admin());

-- ---- CLUBS ----
-- Unauthenticated read needed for login team-selection screen
CREATE POLICY "Anyone can view clubs"
  ON clubs FOR SELECT USING (true);

CREATE POLICY "Platform admins can manage clubs"
  ON clubs FOR ALL USING (is_platform_admin());

-- ---- TEAMS ----
-- Unauthenticated read needed for login team-selection screen
CREATE POLICY "Anyone can view teams"
  ON teams FOR SELECT USING (true);

CREATE POLICY "Team admins can update their team"
  ON teams FOR UPDATE USING (is_team_admin(id) OR is_platform_admin());

CREATE POLICY "Platform admins can manage all teams"
  ON teams FOR ALL USING (is_platform_admin());

-- ---- TEAM MEMBERSHIPS ----
CREATE POLICY "Members can view their team memberships"
  ON team_memberships FOR SELECT USING (
    player_id = auth.uid() OR is_team_member(team_id)
  );

CREATE POLICY "Team admins can manage memberships"
  ON team_memberships FOR ALL USING (
    is_team_admin(team_id) OR is_platform_admin()
  );

-- ---- CLUB MEMBERSHIPS ----
CREATE POLICY "Members can view club memberships"
  ON club_memberships FOR SELECT USING (
    player_id = auth.uid()
  );

CREATE POLICY "Platform admins can manage club memberships"
  ON club_memberships FOR ALL USING (is_platform_admin());

-- ---- LEAGUES ----
CREATE POLICY "Team members can view their league"
  ON leagues FOR SELECT USING (is_team_member(team_id));

CREATE POLICY "Team admins can manage leagues"
  ON leagues FOR ALL USING (is_team_admin(team_id) OR is_platform_admin());

-- ---- LEAGUE TEAMS ----
CREATE POLICY "Team members can view league teams"
  ON league_teams FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues l WHERE l.id = league_teams.league_id
        AND is_team_member(l.team_id)
    )
  );

CREATE POLICY "Team admins can manage league teams"
  ON league_teams FOR ALL USING (
    EXISTS (
      SELECT 1 FROM leagues l WHERE l.id = league_teams.league_id
        AND (is_team_admin(l.team_id) OR is_platform_admin())
    )
  );

-- ---- LEAGUE MATCHES ----
CREATE POLICY "Team members can view league matches"
  ON league_matches FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues l WHERE l.id = league_matches.league_id
        AND is_team_member(l.team_id)
    )
  );

CREATE POLICY "Team admins can manage league matches"
  ON league_matches FOR ALL USING (
    EXISTS (
      SELECT 1 FROM leagues l WHERE l.id = league_matches.league_id
        AND (is_team_admin(l.team_id) OR is_platform_admin())
    )
  );

-- ---- MATCHES ----
CREATE POLICY "Team members can view matches"
  ON matches FOR SELECT USING (is_team_member(team_id));

CREATE POLICY "Team admins can manage matches"
  ON matches FOR ALL USING (is_team_admin(team_id) OR is_platform_admin());

-- ---- MATCH AVAILABILITY ----
CREATE POLICY "Team members can view availability"
  ON match_availability FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_availability.match_id AND is_team_member(m.team_id)
    )
  );

CREATE POLICY "Players can manage own availability"
  ON match_availability FOR ALL USING (player_id = auth.uid());

CREATE POLICY "Team admins can manage all availability"
  ON match_availability FOR ALL
  USING (
    is_team_admin((SELECT team_id FROM matches WHERE id = match_availability.match_id))
    OR is_platform_admin()
  );

-- ---- MATCH ROSTER ----
CREATE POLICY "Team members can view roster"
  ON match_roster FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_roster.match_id AND is_team_member(m.team_id)
    )
  );

CREATE POLICY "Team admins can manage roster"
  ON match_roster FOR ALL USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_roster.match_id
        AND (is_team_admin(m.team_id) OR is_platform_admin())
    )
  );

-- ---- GOALS ----
CREATE POLICY "Team members can view goals"
  ON goals FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = goals.match_id AND is_team_member(m.team_id)
    )
  );

CREATE POLICY "Team admins can manage goals"
  ON goals FOR ALL USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = goals.match_id
        AND (is_team_admin(m.team_id) OR is_platform_admin())
    )
  );

-- ---- UMPIRE DUTIES ----
CREATE POLICY "Team members can view umpire duties"
  ON umpire_duties FOR SELECT USING (is_team_member(team_id));

CREATE POLICY "Team admins can manage umpire duties"
  ON umpire_duties FOR ALL USING (is_team_admin(team_id) OR is_platform_admin());

-- ---- ANNOUNCEMENTS ----
CREATE POLICY "Team members can view announcements"
  ON announcements FOR SELECT USING (is_team_member(team_id));

CREATE POLICY "Team admins can post announcements"
  ON announcements FOR INSERT WITH CHECK (is_team_admin(team_id) OR is_platform_admin());

CREATE POLICY "Authors and admins can update announcements"
  ON announcements FOR UPDATE USING (
    author_id = auth.uid() OR is_team_admin(team_id) OR is_platform_admin()
  );

CREATE POLICY "Team admins can delete announcements"
  ON announcements FOR DELETE USING (is_team_admin(team_id) OR is_platform_admin());

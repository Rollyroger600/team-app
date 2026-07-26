-- Performance cleanup flagged by Supabase's advisor (get_advisors performance):
--   1. auth_rls_initplan: RLS policies called auth.uid()/is_team_admin()/etc. directly,
--      which Postgres re-evaluates per row instead of once per query. Wrap every such
--      call in `(select ...)` so the planner caches it as an InitPlan.
--   2. multiple_permissive_policies: most tables had a separate "admins can manage"
--      (FOR ALL) policy stacked on top of a "members can view" (FOR SELECT) policy,
--      so every SELECT paid for evaluating both. Merged into one policy per command —
--      each merge below ORs the exact original conditions together, so authorization
--      outcomes are unchanged, just fewer policy objects per row.
-- At current data volumes (tens of rows per table) this has ~zero user-visible effect;
-- it's here so it doesn't start mattering once a full season's data accumulates.

-- ── announcements (no multiple-permissive issue, just wrap) ───────────────────────
DROP POLICY IF EXISTS "Team members can view announcements" ON announcements;
CREATE POLICY "Team members can view announcements"
  ON announcements FOR SELECT USING ((select is_team_member(team_id)));

DROP POLICY IF EXISTS "Team admins can post announcements" ON announcements;
CREATE POLICY "Team admins can post announcements"
  ON announcements FOR INSERT WITH CHECK ((select is_team_admin(team_id)) OR (select is_platform_admin()));

DROP POLICY IF EXISTS "Authors and admins can update announcements" ON announcements;
CREATE POLICY "Authors and admins can update announcements"
  ON announcements FOR UPDATE USING (
    (author_id = (select auth.uid())) OR (select is_team_admin(team_id)) OR (select is_platform_admin())
  );

DROP POLICY IF EXISTS "Team admins can delete announcements" ON announcements;
CREATE POLICY "Team admins can delete announcements"
  ON announcements FOR DELETE USING ((select is_team_admin(team_id)) OR (select is_platform_admin()));

-- ── club_memberships ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Platform admins can manage club memberships" ON club_memberships;
DROP POLICY IF EXISTS "Members can view club memberships" ON club_memberships;

CREATE POLICY "Members can view club memberships"
  ON club_memberships FOR SELECT USING (
    (player_id = (select auth.uid())) OR (select is_platform_admin())
  );
CREATE POLICY "Platform admins can insert club memberships"
  ON club_memberships FOR INSERT WITH CHECK ((select is_platform_admin()));
CREATE POLICY "Platform admins can update club memberships"
  ON club_memberships FOR UPDATE USING ((select is_platform_admin()));
CREATE POLICY "Platform admins can delete club memberships"
  ON club_memberships FOR DELETE USING ((select is_platform_admin()));

-- ── clubs (SELECT is already `true` for everyone, so it absorbs the admin OR) ──────
DROP POLICY IF EXISTS "Platform admins can manage clubs" ON clubs;
-- "Anyone can view clubs" (qual = true) is left untouched — no function call to wrap.

CREATE POLICY "Platform admins can insert clubs"
  ON clubs FOR INSERT WITH CHECK ((select is_platform_admin()));
CREATE POLICY "Platform admins can update clubs"
  ON clubs FOR UPDATE USING ((select is_platform_admin()));
CREATE POLICY "Platform admins can delete clubs"
  ON clubs FOR DELETE USING ((select is_platform_admin()));

-- ── clubs_registry (no multiple-permissive issue, just wrap) ──────────────────────
DROP POLICY IF EXISTS "Platform admins can delete from registry" ON clubs_registry;
CREATE POLICY "Platform admins can delete from registry"
  ON clubs_registry FOR DELETE USING ((select is_platform_admin()));

DROP POLICY IF EXISTS "Authenticated users can add to clubs registry" ON clubs_registry;
CREATE POLICY "Authenticated users can add to clubs registry"
  ON clubs_registry FOR INSERT WITH CHECK (((select auth.role()) = 'authenticated'));

DROP POLICY IF EXISTS "Authenticated users can view clubs registry" ON clubs_registry;
CREATE POLICY "Authenticated users can view clubs registry"
  ON clubs_registry FOR SELECT USING (((select auth.role()) = 'authenticated'));

DROP POLICY IF EXISTS "Creator or platform admin can update registry" ON clubs_registry;
CREATE POLICY "Creator or platform admin can update registry"
  ON clubs_registry FOR UPDATE USING (
    (created_by = (select auth.uid())) OR (select is_platform_admin())
  );

-- ── goals ──────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage goals" ON goals;
DROP POLICY IF EXISTS "Team members can view goals" ON goals;

CREATE POLICY "Team members can view goals"
  ON goals FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m WHERE m.id = goals.match_id
        AND ((select is_team_member(m.team_id)) OR (select is_team_admin(m.team_id)) OR (select is_platform_admin()))
    )
  );
CREATE POLICY "Team admins can insert goals"
  ON goals FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = goals.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can update goals"
  ON goals FOR UPDATE USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = goals.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can delete goals"
  ON goals FOR DELETE USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = goals.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );

-- ── league_matches ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage league matches" ON league_matches;
DROP POLICY IF EXISTS "Team members can view league matches" ON league_matches;

CREATE POLICY "Team members can view league matches"
  ON league_matches FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues l WHERE l.id = league_matches.league_id
        AND ((select is_team_member(l.team_id)) OR (select is_team_admin(l.team_id)) OR (select is_platform_admin()))
    )
  );
CREATE POLICY "Team admins can insert league matches"
  ON league_matches FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM leagues l WHERE l.id = league_matches.league_id AND ((select is_team_admin(l.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can update league matches"
  ON league_matches FOR UPDATE USING (
    EXISTS (SELECT 1 FROM leagues l WHERE l.id = league_matches.league_id AND ((select is_team_admin(l.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can delete league matches"
  ON league_matches FOR DELETE USING (
    EXISTS (SELECT 1 FROM leagues l WHERE l.id = league_matches.league_id AND ((select is_team_admin(l.team_id)) OR (select is_platform_admin())))
  );

-- ── league_teams ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage league teams" ON league_teams;
DROP POLICY IF EXISTS "Team members can view league teams" ON league_teams;

CREATE POLICY "Team members can view league teams"
  ON league_teams FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues l WHERE l.id = league_teams.league_id
        AND ((select is_team_member(l.team_id)) OR (select is_team_admin(l.team_id)) OR (select is_platform_admin()))
    )
  );
CREATE POLICY "Team admins can insert league teams"
  ON league_teams FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM leagues l WHERE l.id = league_teams.league_id AND ((select is_team_admin(l.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can update league teams"
  ON league_teams FOR UPDATE USING (
    EXISTS (SELECT 1 FROM leagues l WHERE l.id = league_teams.league_id AND ((select is_team_admin(l.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can delete league teams"
  ON league_teams FOR DELETE USING (
    EXISTS (SELECT 1 FROM leagues l WHERE l.id = league_teams.league_id AND ((select is_team_admin(l.team_id)) OR (select is_platform_admin())))
  );

-- ── leagues ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage leagues" ON leagues;
DROP POLICY IF EXISTS "Team members can view their league" ON leagues;

CREATE POLICY "Team members can view their league"
  ON leagues FOR SELECT USING (
    (select is_team_member(team_id)) OR (select is_team_admin(team_id)) OR (select is_platform_admin())
  );
CREATE POLICY "Team admins can insert leagues"
  ON leagues FOR INSERT WITH CHECK ((select is_team_admin(team_id)) OR (select is_platform_admin()));
CREATE POLICY "Team admins can update leagues"
  ON leagues FOR UPDATE USING ((select is_team_admin(team_id)) OR (select is_platform_admin()));
CREATE POLICY "Team admins can delete leagues"
  ON leagues FOR DELETE USING ((select is_team_admin(team_id)) OR (select is_platform_admin()));

-- ── match_availability (3-way overlap: own-row, team-admin, team-member) ──────────
DROP POLICY IF EXISTS "Players can manage own availability" ON match_availability;
DROP POLICY IF EXISTS "Team admins can manage all availability" ON match_availability;
DROP POLICY IF EXISTS "Team members can view availability" ON match_availability;

CREATE POLICY "Team members can view availability"
  ON match_availability FOR SELECT USING (
    (player_id = (select auth.uid()))
    OR (select is_team_admin((SELECT matches.team_id FROM matches WHERE matches.id = match_availability.match_id)))
    OR (select is_platform_admin())
    OR EXISTS (SELECT 1 FROM matches m WHERE m.id = match_availability.match_id AND (select is_team_member(m.team_id)))
  );
CREATE POLICY "Players and admins can insert availability"
  ON match_availability FOR INSERT WITH CHECK (
    (player_id = (select auth.uid()))
    OR (select is_team_admin((SELECT matches.team_id FROM matches WHERE matches.id = match_availability.match_id)))
    OR (select is_platform_admin())
  );
CREATE POLICY "Players and admins can update availability"
  ON match_availability FOR UPDATE USING (
    (player_id = (select auth.uid()))
    OR (select is_team_admin((SELECT matches.team_id FROM matches WHERE matches.id = match_availability.match_id)))
    OR (select is_platform_admin())
  );
CREATE POLICY "Players and admins can delete availability"
  ON match_availability FOR DELETE USING (
    (player_id = (select auth.uid()))
    OR (select is_team_admin((SELECT matches.team_id FROM matches WHERE matches.id = match_availability.match_id)))
    OR (select is_platform_admin())
  );

-- ── match_cards ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage cards" ON match_cards;
DROP POLICY IF EXISTS "Team members can view cards" ON match_cards;

CREATE POLICY "Team members can view cards"
  ON match_cards FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m WHERE m.id = match_cards.match_id
        AND ((select is_team_member(m.team_id)) OR (select is_team_admin(m.team_id)) OR (select is_platform_admin()))
    )
  );
CREATE POLICY "Team admins can insert cards"
  ON match_cards FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_cards.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can update cards"
  ON match_cards FOR UPDATE USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_cards.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can delete cards"
  ON match_cards FOR DELETE USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_cards.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );

-- ── match_roster ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage roster" ON match_roster;
DROP POLICY IF EXISTS "Team members can view roster" ON match_roster;

CREATE POLICY "Team members can view roster"
  ON match_roster FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m WHERE m.id = match_roster.match_id
        AND ((select is_team_member(m.team_id)) OR (select is_team_admin(m.team_id)) OR (select is_platform_admin()))
    )
  );
CREATE POLICY "Team admins can insert roster"
  ON match_roster FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_roster.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can update roster"
  ON match_roster FOR UPDATE USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_roster.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );
CREATE POLICY "Team admins can delete roster"
  ON match_roster FOR DELETE USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_roster.match_id AND ((select is_team_admin(m.team_id)) OR (select is_platform_admin())))
  );

-- ── matches ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage matches" ON matches;
DROP POLICY IF EXISTS "Team members can view matches" ON matches;

CREATE POLICY "Team members can view matches"
  ON matches FOR SELECT USING (
    (select is_team_member(team_id)) OR (select is_team_admin(team_id)) OR (select is_platform_admin())
  );
CREATE POLICY "Team admins can insert matches"
  ON matches FOR INSERT WITH CHECK ((select is_team_admin(team_id)) OR (select is_platform_admin()));
CREATE POLICY "Team admins can update matches"
  ON matches FOR UPDATE USING ((select is_team_admin(team_id)) OR (select is_platform_admin()));
CREATE POLICY "Team admins can delete matches"
  ON matches FOR DELETE USING ((select is_team_admin(team_id)) OR (select is_platform_admin()));

-- ── potjescup_scores ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage potjescup scores" ON potjescup_scores;
DROP POLICY IF EXISTS "Team members can view potjescup scores" ON potjescup_scores;

CREATE POLICY "Team members can view potjescup scores"
  ON potjescup_scores FOR SELECT USING (
    (select is_team_member((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
    OR (select is_team_admin((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
    OR (select is_club_admin_for_team((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
  );
CREATE POLICY "Team admins can insert potjescup scores"
  ON potjescup_scores FOR INSERT WITH CHECK (
    (select is_team_admin((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
    OR (select is_club_admin_for_team((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
  );
CREATE POLICY "Team admins can update potjescup scores"
  ON potjescup_scores FOR UPDATE USING (
    (select is_team_admin((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
    OR (select is_club_admin_for_team((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
  );
CREATE POLICY "Team admins can delete potjescup scores"
  ON potjescup_scores FOR DELETE USING (
    (select is_team_admin((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
    OR (select is_club_admin_for_team((SELECT potjescup_sessions.team_id FROM potjescup_sessions WHERE potjescup_sessions.id = potjescup_scores.session_id)))
  );

-- ── potjescup_sessions ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage potjescup sessions" ON potjescup_sessions;
DROP POLICY IF EXISTS "Team members can view potjescup sessions" ON potjescup_sessions;

CREATE POLICY "Team members can view potjescup sessions"
  ON potjescup_sessions FOR SELECT USING (
    (select is_team_member(team_id)) OR (select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id))
  );
CREATE POLICY "Team admins can insert potjescup sessions"
  ON potjescup_sessions FOR INSERT WITH CHECK ((select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id)));
CREATE POLICY "Team admins can update potjescup sessions"
  ON potjescup_sessions FOR UPDATE USING ((select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id)));
CREATE POLICY "Team admins can delete potjescup sessions"
  ON potjescup_sessions FOR DELETE USING ((select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id)));

-- ── profiles (3-way overlap on SELECT) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Platform admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Team members can view each other's profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own or teammates or admin"
  ON profiles FOR SELECT USING (
    (id = (select auth.uid()))
    OR (select is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM team_memberships tm1 JOIN team_memberships tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.player_id = (select auth.uid()) AND tm2.player_id = profiles.id
        AND tm1.active = true AND tm2.active = true
    )
  );
CREATE POLICY "Users can update own profile or platform admin"
  ON profiles FOR UPDATE USING ((id = (select auth.uid())) OR (select is_platform_admin()));
CREATE POLICY "Platform admins can insert profiles"
  ON profiles FOR INSERT WITH CHECK ((select is_platform_admin()));
CREATE POLICY "Platform admins can delete profiles"
  ON profiles FOR DELETE USING ((select is_platform_admin()));

-- ── team_memberships ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage memberships" ON team_memberships;
DROP POLICY IF EXISTS "Members can view their team memberships" ON team_memberships;

CREATE POLICY "Members can view their team memberships"
  ON team_memberships FOR SELECT USING (
    (player_id = (select auth.uid())) OR (select is_team_member(team_id)) OR (select is_team_admin(team_id)) OR (select is_platform_admin())
  );
CREATE POLICY "Team admins can insert memberships"
  ON team_memberships FOR INSERT WITH CHECK ((select is_team_admin(team_id)) OR (select is_platform_admin()));
CREATE POLICY "Team admins can update memberships"
  ON team_memberships FOR UPDATE USING ((select is_team_admin(team_id)) OR (select is_platform_admin()));
CREATE POLICY "Team admins can delete memberships"
  ON team_memberships FOR DELETE USING ((select is_team_admin(team_id)) OR (select is_platform_admin()));
-- Note: the prevent_unauthorized_role_change trigger (separate from RLS) still
-- independently guards the `role` column — untouched by this migration.

-- ── teams (SELECT already `true`, UPDATE had 2-way overlap) ───────────────────────
DROP POLICY IF EXISTS "Platform admins can manage all teams" ON teams;
DROP POLICY IF EXISTS "Team admins can update their team" ON teams;
-- "Anyone can view teams" (qual = true) is left untouched — no function call to wrap.

CREATE POLICY "Team admins can update their team"
  ON teams FOR UPDATE USING ((select is_team_admin(id)) OR (select is_platform_admin()));
CREATE POLICY "Platform admins can insert teams"
  ON teams FOR INSERT WITH CHECK ((select is_platform_admin()));
CREATE POLICY "Platform admins can delete teams"
  ON teams FOR DELETE USING ((select is_platform_admin()));

-- ── umpire_duties ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team admins can manage umpire duties" ON umpire_duties;
DROP POLICY IF EXISTS "Team members can view umpire duties" ON umpire_duties;

CREATE POLICY "Team members can view umpire duties"
  ON umpire_duties FOR SELECT USING (
    (select is_team_member(team_id)) OR (select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id))
  );
CREATE POLICY "Team admins can insert umpire duties"
  ON umpire_duties FOR INSERT WITH CHECK ((select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id)));
CREATE POLICY "Team admins can update umpire duties"
  ON umpire_duties FOR UPDATE USING ((select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id)));
CREATE POLICY "Team admins can delete umpire duties"
  ON umpire_duties FOR DELETE USING ((select is_team_admin(team_id)) OR (select is_club_admin_for_team(team_id)));

-- ── Missing covering indexes on foreign keys ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_match_id ON announcements(match_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_player_id ON club_memberships(player_id);
CREATE INDEX IF NOT EXISTS idx_clubs_registry_id ON clubs(registry_id);
CREATE INDEX IF NOT EXISTS idx_clubs_registry_created_by ON clubs_registry(created_by);
CREATE INDEX IF NOT EXISTS idx_goals_assist_id ON goals(assist_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_away_team_id ON league_matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_home_team_id ON league_matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_league_id ON league_matches(league_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_team_id ON league_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_leagues_team_id ON leagues(team_id);
CREATE INDEX IF NOT EXISTS idx_match_availability_set_by ON match_availability(set_by);
CREATE INDEX IF NOT EXISTS idx_match_cards_match_id ON match_cards(match_id);
CREATE INDEX IF NOT EXISTS idx_match_cards_player_id ON match_cards(player_id);
CREATE INDEX IF NOT EXISTS idx_match_roster_player_id ON match_roster(player_id);
CREATE INDEX IF NOT EXISTS idx_matches_registry_id ON matches(registry_id);
CREATE INDEX IF NOT EXISTS idx_potjescup_scores_player_id ON potjescup_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_potjescup_sessions_team_id ON potjescup_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_league_id ON teams(league_id);
CREATE INDEX IF NOT EXISTS idx_teams_club_id ON teams(club_id);
CREATE INDEX IF NOT EXISTS idx_umpire_duties_match_id ON umpire_duties(match_id);
CREATE INDEX IF NOT EXISTS idx_umpire_duties_player_id ON umpire_duties(player_id);
CREATE INDEX IF NOT EXISTS idx_umpire_duties_team_id ON umpire_duties(team_id);

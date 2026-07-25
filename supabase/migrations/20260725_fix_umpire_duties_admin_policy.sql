-- The "Team admins can manage umpire duties" policy checked is_team_admin() OR
-- is_platform_admin(), but never is_club_admin_for_team() — the same authorization
-- gap that was previously found and fixed in the auth-handler edge function's
-- isAdminForTeam (commit 9a039fa). A club_admin (or, since club_admin has since
-- been collapsed into platform_admin, any caller relying on that fallthrough)
-- without a direct team_admin membership could see the Fluitbeurten admin UI but
-- have every insert/update/delete against umpire_duties silently rejected by RLS.
DROP POLICY IF EXISTS "Team admins can manage umpire duties" ON umpire_duties;
CREATE POLICY "Team admins can manage umpire duties"
  ON umpire_duties FOR ALL USING (is_team_admin(team_id) OR is_club_admin_for_team(team_id));

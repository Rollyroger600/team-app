-- 1. Fix prevent_unauthorized_role_change: the service_role bypass checked a legacy
--    GUC (request.jwt.claim.role) that this PostgREST version no longer sets, so it
--    always fell through and rejected every role change — including legitimate ones
--    made by the auth-handler edge function's service-role client. Use auth.role(),
--    Supabase's own helper, which checks both the legacy GUC and the modern
--    request.jwt.claims JSON blob.
CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW; -- edge function already gated this via isClubAdminForTeam()
    END IF;
    IF NOT (is_club_admin_for_team(NEW.team_id) OR is_platform_admin()) THEN
      RAISE EXCEPTION 'Only club_admin or platform_admin may change team_memberships.role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Collapse club_admin into platform_admin: this app now manages a single team, so
--    the separate club_admin tier is redundant. Rather than touching every RLS policy
--    that references is_club_admin_for_team() (umpire_duties, announcements,
--    potjescup_sessions/scores, ...), redefine the primitive itself — every caller
--    now resolves to "is the caller the platform admin?" without further changes.
CREATE OR REPLACE FUNCTION is_club_admin_for_team(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_platform_admin();
$$;

-- ============================================================
-- Migration: Auth + RBAC hardening (PIN login rewrite)
-- Apply directly via Supabase MCP / SQL editor.
-- ============================================================

-- 1. Close a role-escalation hole: RLS grants team_admin FOR ALL on
--    team_memberships (see "Team admins can manage memberships" in
--    schema.sql), which has no protection on the `role` column itself.
--    A team_admin's own JWT can currently call
--    `supabase.from('team_memberships').update({role:'team_admin'})`
--    directly, bypassing the edge function's intended
--    "only club_admin+ may change roles" rule. RLS USING-clauses can't
--    see which column changed, so this needs a trigger.
CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- The auth-handler edge function uses the service-role key and has
    -- already performed its own club_admin+ check before writing here.
    IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT (is_club_admin_for_team(NEW.team_id) OR is_platform_admin()) THEN
      RAISE EXCEPTION 'Only club_admin or platform_admin may change team_memberships.role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_role_change ON team_memberships;
CREATE TRIGGER trg_prevent_unauthorized_role_change
  BEFORE UPDATE ON team_memberships
  FOR EACH ROW EXECUTE FUNCTION prevent_unauthorized_role_change();

-- 2. Fix mutable search_path on the RBAC helper functions touched by
--    this rewrite (flagged by Supabase's security advisor).
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE team_id = p_team_id AND player_id = auth.uid() AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION is_team_admin(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE team_id = p_team_id AND player_id = auth.uid()
      AND role = 'team_admin' AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION is_club_admin_for_team(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_memberships cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE cm.player_id = auth.uid()
      AND t.id = p_team_id
      AND cm.role = 'club_admin'
  ) OR is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION get_team_players_for_login(p_team_id UUID)
RETURNS TABLE (player_id UUID, display_name TEXT, jersey_number SMALLINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, COALESCE(p.display_name, p.full_name, p.nickname) AS display_name, p.jersey_number
  FROM profiles p
  JOIN team_memberships tm ON tm.player_id = p.id
  WHERE tm.team_id = p_team_id AND tm.active = true
  ORDER BY p.jersey_number ASC NULLS LAST, display_name ASC;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

-- 3. Wipe pre-season test login data (no real players depend on this
--    yet — confirmed safe). Cascades through profiles -> player_credentials
--    -> team_memberships/club_memberships automatically.
DELETE FROM auth.users WHERE email LIKE '%@team.internal' OR email LIKE '%@test.nl';

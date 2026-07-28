-- Availability statuses: rename 'maybe' to 'injured' and add admin-only 'rostered_off'.
--
-- 'Misschien' became 'Geblesseerd' in the UI, so the stored value follows —
-- otherwise the database says 'maybe' forever while every screen says injured.
--
-- 'rostered_off' is a coach decision, not a player answer, so only a team_admin
-- or platform_admin may set it. RLS can't express that: the existing policies
-- allow a player to write to their own row, and they can't inspect the value
-- being written per-column. A BEFORE trigger can — same approach as
-- prevent_unauthorized_role_change on team_memberships.role.

-- 1. Existing data (a single row at time of writing).
UPDATE match_availability SET status = 'injured' WHERE status = 'maybe';

-- 2. Pin the allowed values. There was no constraint at all until now, so a
--    typo in any client silently stored garbage.
ALTER TABLE match_availability
  DROP CONSTRAINT IF EXISTS match_availability_status_check;

ALTER TABLE match_availability
  ADD CONSTRAINT match_availability_status_check
  CHECK (status IN ('available', 'unavailable', 'injured', 'rostered_off'));

-- 3. Reserve 'rostered_off' for admins.
CREATE OR REPLACE FUNCTION enforce_admin_only_rostered_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
BEGIN
  -- Only guard the reserved value; every other status is unchanged.
  IF NEW.status IS DISTINCT FROM 'rostered_off' THEN
    RETURN NEW;
  END IF;

  -- The edge function and any server-side job run as the service role.
  -- Must be auth.role(); the legacy request.jwt.claim.role GUC is not set by
  -- this PostgREST version and would reject every legitimate write.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT m.team_id INTO v_team_id FROM matches m WHERE m.id = NEW.match_id;

  IF is_team_admin(v_team_id) OR is_platform_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Alleen beheerders kunnen een speler uitroosteren'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_only_rostered_off ON match_availability;

CREATE TRIGGER enforce_admin_only_rostered_off
  BEFORE INSERT OR UPDATE ON match_availability
  FOR EACH ROW
  EXECUTE FUNCTION enforce_admin_only_rostered_off();

-- A trigger function does not need EXECUTE granted to the DML caller: Postgres
-- checks that at CREATE TRIGGER time, not per row. Leaving the default grant in
-- place just exposes a SECURITY DEFINER function on /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.enforce_admin_only_rostered_off() FROM PUBLIC, anon, authenticated;

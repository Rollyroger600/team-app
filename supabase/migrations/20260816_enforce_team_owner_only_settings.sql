-- Multi-team rollenmodel, fase 2: RLS is row-level, niet column-level (zelfde beperking
-- als eerder bij team_memberships.role), dus de teaminstellingen-kolommen op teams
-- krijgen dezelfde triggergebaseerde bescherming als enforce_admin_only_rostered_off.
-- Dekt zowel de nieuwe fase-2 kolommen als de bestaande instellingen (name,
-- gathering_lead_time, travel_buffer_minutes, match_squad_size) — de hele
-- Admin → Team-instellingen-pagina is bewust hoofdbeheerder/platform-admin-only.
CREATE OR REPLACE FUNCTION public.enforce_team_owner_only_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF is_team_owner(NEW.id) OR is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.gathering_lead_time IS DISTINCT FROM OLD.gathering_lead_time
     OR NEW.travel_buffer_minutes IS DISTINCT FROM OLD.travel_buffer_minutes
     OR NEW.match_squad_size IS DISTINCT FROM OLD.match_squad_size
     OR NEW.potjescup_enabled IS DISTINCT FROM OLD.potjescup_enabled
     OR NEW.potjescup_rules_text IS DISTINCT FROM OLD.potjescup_rules_text
     OR NEW.fluitbeurten_enabled IS DISTINCT FROM OLD.fluitbeurten_enabled
     OR NEW.fluitbeurten_mode IS DISTINCT FROM OLD.fluitbeurten_mode
     OR NEW.fluitbeurten_day_of_week IS DISTINCT FROM OLD.fluitbeurten_day_of_week
     OR NEW.fluitbeurten_relative_to_match IS DISTINCT FROM OLD.fluitbeurten_relative_to_match
     OR NEW.gathering_banner_enabled IS DISTINCT FROM OLD.gathering_banner_enabled
  THEN
    RAISE EXCEPTION 'Alleen de hoofdbeheerder of platform-admin kan teaminstellingen wijzigen'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER enforce_team_owner_only_settings
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION enforce_team_owner_only_settings();

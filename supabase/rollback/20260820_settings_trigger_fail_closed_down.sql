-- TERUGDRAAIEN van 20260820_settings_trigger_fail_closed.sql
--
-- Herstelt de kolom-voor-kolom versie uit 20260816_enforce_team_owner_only_settings_v2.sql.
-- Let op: die versie faalt OPEN — instellingenkolommen die niet in de keten hieronder
-- staan (bijv. season, of alles wat na 2026-08-16 is toegevoegd) worden dan weer
-- schrijfbaar voor een gewone Beheerder. Alleen gebruiken als de fail-closed variant
-- een legitieme schrijfactie blokkeert, en dan zo snel mogelijk gericht repareren.
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
     OR NEW.gathering_rounding_minutes IS DISTINCT FROM OLD.gathering_rounding_minutes
  THEN
    RAISE EXCEPTION 'Alleen de hoofdbeheerder of platform-admin kan teaminstellingen wijzigen'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

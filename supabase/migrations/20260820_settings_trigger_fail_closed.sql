-- Fase 0.5: enforce_team_owner_only_settings() faalde OPEN.
--
-- De v1/v2-versie was een handmatige IS DISTINCT FROM-keten met één clausule per
-- kolom. Elke nieuwe instellingenkolom op teams moest daar handmatig bij, en als je
-- dat vergat was die kolom gewoon schrijfbaar voor een gewone Beheerder (de RLS
-- UPDATE-policy op teams is is_team_admin OR is_platform_admin). Met vier features
-- op de rol die elk kolommen toevoegen waren dat vier kansen om het stil mis te laten
-- gaan. Live aangetoond: `season` stond niet in de v2-lijst en was dus schrijfbaar
-- voor een gewone Beheerder.
--
-- Deze versie vergelijkt de hele rij als jsonb en faalt DICHT: alles op teams is
-- automatisch hoofdbeheerder-only, ook kolommen die later worden toegevoegd. Wil je
-- een kolom bewust door een gewone Beheerder laten schrijven, zet 'm dan expliciet in
-- v_admin_writable — die lijst is nu leeg, want er is vandaag geen zo'n kolom.
--
-- Gevolg voor de rest van de roadmap: nieuwe instellingenkolommen hebben GEEN
-- trigger-migratie meer nodig.
--
-- Terugdraaien: supabase/rollback/20260820_settings_trigger_fail_closed_down.sql
CREATE OR REPLACE FUNCTION public.enforce_team_owner_only_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Kolommen die een gewone Beheerder wél mag wijzigen. Bewust leeg.
  v_admin_writable text[] := ARRAY[]::text[];
  v_old jsonb;
  v_new jsonb;
  k text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF is_team_owner(NEW.id) OR is_platform_admin() THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOREACH k IN ARRAY v_admin_writable LOOP
    v_old := v_old - k;
    v_new := v_new - k;
  END LOOP;

  IF v_new IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'Alleen de hoofdbeheerder of platform-admin kan teaminstellingen wijzigen'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

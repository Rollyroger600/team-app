-- Multi-team rollenmodel, fase 1: een "Hoofdbeheerder"-laag tussen Beheerder en
-- platform_admin. team_memberships.role is plain TEXT zonder CHECK-constraint, dus de
-- nieuwe waarde 'team_owner' kost geen schemawijziging op de kolom zelf — alleen de
-- functies die 'm interpreteren.

-- is_team_admin() breidt uit: een Hoofdbeheerder mag alles wat een Beheerder mag, dus
-- de rest van de app (RLS op wedstrijden, doelpunten, fluitbeurten, Potjescup, ...)
-- hoeft nergens apart op team_owner te checken.
CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE team_id = p_team_id AND player_id = auth.uid()
      AND role IN ('team_admin', 'team_owner') AND active = true
  );
$function$;

-- Nieuw: alleen waar voor de instellingenpagina (team-toggles, later fase 2) en voor
-- het toekennen/afpakken van de gewone Beheerder-rol (zie de aangescherpte
-- change_role-actie in de edge function).
CREATE OR REPLACE FUNCTION public.is_team_owner(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE team_id = p_team_id AND player_id = auth.uid()
      AND role = 'team_owner' AND active = true
  );
$function$;

-- Bestaande Beheerders van het huidige (live) team worden Hoofdbeheerder, zodat er bij
-- het uitrollen geen capability-verlies is. Rogier kan er zelf later een paar terugzetten
-- naar gewone Beheerder via Admin → Spelers.
-- prevent_unauthorized_role_change() blokkeert dit terecht buiten een ingelogde
-- platform_admin-sessie om (een migratie heeft geen auth.uid()) — de trigger gaat hier
-- gericht even uit, alleen voor deze ene bulk-update.
ALTER TABLE team_memberships DISABLE TRIGGER trg_prevent_unauthorized_role_change;
UPDATE team_memberships SET role = 'team_owner' WHERE role = 'team_admin';
ALTER TABLE team_memberships ENABLE TRIGGER trg_prevent_unauthorized_role_change;

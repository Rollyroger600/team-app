-- Stap 1-S-a: drie publieke lekken dichten die alleen de anon key nodig hadden.
-- De anon key zit in de frontend-bundle en is dus openbaar; alles wat hieronder
-- staat was daarmee door iedereen op internet op te halen.
--
-- Puur intrekkend: geen kolommen, geen data, geen policies. Terugdraaien kan met
-- supabase/rollback/20260820_lock_down_public_reads_down.sql.

-- 1. De namenlijst van elk team, met een willekeurig team_id.
--    Enige aanroeper is auth-handler/index.ts, en die gaat via de service role
--    (svc.rpc) -- service_role staat niet in de REVOKE-lijst en houdt EXECUTE.
REVOKE EXECUTE ON FUNCTION public.get_team_players_for_login(uuid)
  FROM PUBLIC, anon, authenticated;

-- 2. De views misten security_invoker en draaiden dus met eigenaarsrechten:
--    ze gingen volledig om RLS heen. Eén GET gaf alle spelersnamen met goals,
--    assists en aanwezigheidshistorie van alle teams tegelijk.
--    security_invoker laat de policies van de onderliggende tabellen gelden;
--    die zijn allemaal 'eigen rij OF teamgenoot OF beheerder'.
ALTER VIEW public.v_player_stats     SET (security_invoker = true);
ALTER VIEW public.v_league_standings SET (security_invoker = true);

-- Uitgedeeld was arwdDxtm (inclusief schrijfrechten) aan zowel anon als
-- authenticated. anon heeft hier niets te zoeken; authenticated houdt SELECT,
-- want src/lib/stats.ts leest v_player_stats ingelogd.
REVOKE ALL ON public.v_player_stats, public.v_league_standings FROM anon;
REVOKE ALL ON public.v_player_stats, public.v_league_standings FROM authenticated;
GRANT SELECT ON public.v_player_stats, public.v_league_standings TO authenticated;

-- 3. Publiek aanroepbaar orakel op e-mailadres ("bestaat dit adres?"), met nul
--    aanroepers in de codebase.
DROP FUNCTION IF EXISTS public.check_email_exists(text);

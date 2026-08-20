-- Draait 20260820_lock_down_public_reads.sql terug.
-- Herstelt daarmee ook de drie lekken -- alleen draaien als er echt iets stuk is.

GRANT EXECUTE ON FUNCTION public.get_team_players_for_login(uuid) TO PUBLIC, anon, authenticated;

ALTER VIEW public.v_player_stats     SET (security_invoker = false);
ALTER VIEW public.v_league_standings SET (security_invoker = false);
GRANT ALL ON public.v_player_stats, public.v_league_standings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE email = lower(p_email));
$function$;

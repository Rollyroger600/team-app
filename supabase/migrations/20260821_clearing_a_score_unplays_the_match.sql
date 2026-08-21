-- Een gewiste uitslag mag niet meer meetellen als gespeelde wedstrijd.
--
-- Twee gaten die hier samenkwamen:
--
-- 1. sync_league_score_to_match zette status wel op 'completed' zodra er een
--    uitslag kwam, maar nooit terug. Een gewiste uitslag liet de eigen wedstrijd
--    dus als "gespeeld" achter, met lege score.
-- 2. v_league_standings telt gespeelde wedstrijden via `lm.status = 'completed'`.
--    Een rij met die status maar zonder uitslag telde daardoor mee als gespeeld
--    (played +1) en leverde 0 punten op -- alsof het een verloren wedstrijd was.
--    De stand hoort af te hangen van de uitslag zelf, niet van een statusveld dat
--    daar los van gezet kan worden.
--
-- Een afgelaste wedstrijd blijft in beide gevallen afgelast.

CREATE OR REPLACE FUNCTION public.sync_league_score_to_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.score_home IS NOT DISTINCT FROM OLD.score_home
     AND NEW.score_away IS NOT DISTINCT FROM OLD.score_away THEN
    RETURN NEW;
  END IF;

  UPDATE matches m
     SET score_home = NEW.score_home,
         score_away = NEW.score_away,
         status = CASE
                    WHEN NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL
                      THEN 'completed'
                    -- Uitslag weg = niet gespeeld. 'cancelled' blijft staan.
                    WHEN m.status = 'completed' THEN 'upcoming'
                    ELSE m.status
                  END
   WHERE m.league_match_id = NEW.id;

  RETURN NEW;
END;
$function$;

-- security_invoker moet expliciet mee bij CREATE OR REPLACE: zonder die optie
-- draait de view weer met eigenaarsrechten en gaat hij om RLS heen -- precies het
-- lek dat 20260820_lock_down_public_reads.sql dichtte.
CREATE OR REPLACE VIEW public.v_league_standings
WITH (security_invoker = true) AS
 SELECT lt.league_id,
    lt.id AS league_team_id,
    lt.team_id,
    lt.team_name,
    lt.is_own_team,
    cr.primary_color,
    count(lm.id) AS played,
    sum(CASE WHEN lt.id = lm.home_team_id AND lm.score_home > lm.score_away
              OR lt.id = lm.away_team_id AND lm.score_away > lm.score_home THEN 1 ELSE 0 END) AS wins,
    sum(CASE WHEN lm.score_home = lm.score_away THEN 1 ELSE 0 END) AS draws,
    sum(CASE WHEN lt.id = lm.home_team_id AND lm.score_home < lm.score_away
              OR lt.id = lm.away_team_id AND lm.score_away < lm.score_home THEN 1 ELSE 0 END) AS losses,
    sum(CASE WHEN lt.id = lm.home_team_id THEN COALESCE(lm.score_home::integer, 0)
             ELSE COALESCE(lm.score_away::integer, 0) END) AS goals_for,
    sum(CASE WHEN lt.id = lm.home_team_id THEN COALESCE(lm.score_away::integer, 0)
             ELSE COALESCE(lm.score_home::integer, 0) END) AS goals_against,
    sum(CASE WHEN lt.id = lm.home_team_id AND lm.score_home > lm.score_away
              OR lt.id = lm.away_team_id AND lm.score_away > lm.score_home THEN 3
             WHEN lm.score_home = lm.score_away THEN 1
             ELSE 0 END) AS points
   FROM league_teams lt
     LEFT JOIN clubs_registry cr ON cr.id = lt.registry_id
     LEFT JOIN league_matches lm
       ON (lm.home_team_id = lt.id OR lm.away_team_id = lt.id)
      AND lm.status = 'completed'
      -- Nieuw: zonder uitslag telt de wedstrijd niet mee.
      AND lm.score_home IS NOT NULL
      AND lm.score_away IS NOT NULL
  GROUP BY lt.league_id, lt.id, lt.team_id, lt.team_name, lt.is_own_team, cr.primary_color;

REVOKE ALL ON public.v_league_standings FROM anon;
GRANT SELECT ON public.v_league_standings TO authenticated;

-- Repareer rijen die al in deze toestand staan (status 'completed', geen uitslag).
UPDATE matches SET status = 'upcoming'
 WHERE status = 'completed' AND score_home IS NULL AND score_away IS NULL;

UPDATE league_matches SET status = 'upcoming'
 WHERE status = 'completed' AND score_home IS NULL AND score_away IS NULL;

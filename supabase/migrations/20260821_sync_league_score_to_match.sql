-- Stap 2C: een poule-uitslag doorzetten naar de gekoppelde eigen wedstrijd.
--
-- Waarom dit nodig is: matches.score_home/score_away bestaan al en worden
-- gelezen door Stats.tsx en AdminMatchGoals.tsx, maar werden nergens geschreven.
-- Beide schermen toonden daardoor altijd "- -". De uitslagen die er wel zijn
-- staan in league_matches, ingevoerd via Admin -> Uitslagen invoeren.
--
-- Beide kolommen betekenen "score van het thuisteam" -- geverifieerd aan de drie
-- aanroepplekken die allemaal `is_home ? score_home : score_away` doen
-- (Stats.tsx:100, AdminMatchGoals.tsx:238 en :340). Dus een rechte kopie, geen
-- omdraaiing.
--
-- Terugdraaien: DROP TRIGGER trg_sync_league_score_to_match ON league_matches;
-- De backfill hoeft niet terug -- die vult kolommen die nu leeg zijn en die de
-- UI toch al toonde.

CREATE OR REPLACE FUNCTION public.sync_league_score_to_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Alleen doen als er echt iets aan de uitslag verandert.
  IF NEW.score_home IS NOT DISTINCT FROM OLD.score_home
     AND NEW.score_away IS NOT DISTINCT FROM OLD.score_away THEN
    RETURN NEW;
  END IF;

  UPDATE matches m
     SET score_home = NEW.score_home,
         score_away = NEW.score_away,
         -- Zonder dit blijft een wedstrijd met uitslag op 'upcoming' staan, en
         -- dan verbergt AdminMatchEdit juist de uitslagvelden.
         status = CASE
                    WHEN NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL
                      THEN 'completed'
                    ELSE m.status
                  END
   WHERE m.league_match_id = NEW.id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_league_score_to_match ON league_matches;
CREATE TRIGGER trg_sync_league_score_to_match
  AFTER UPDATE ON league_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_league_score_to_match();

-- Backfill van wat er al staat. Raakt alleen rijen waar de eigen wedstrijd nog
-- geen uitslag heeft, zodat een handmatig ingevoerde score niet wordt overschreven.
UPDATE matches m
   SET score_home = lm.score_home,
       score_away = lm.score_away,
       status = CASE
                  WHEN lm.score_home IS NOT NULL AND lm.score_away IS NOT NULL
                    THEN 'completed'
                  ELSE m.status
                END
  FROM league_matches lm
 WHERE m.league_match_id = lm.id
   AND lm.score_home IS NOT NULL
   AND lm.score_away IS NOT NULL
   AND m.score_home IS NULL
   AND m.score_away IS NULL;

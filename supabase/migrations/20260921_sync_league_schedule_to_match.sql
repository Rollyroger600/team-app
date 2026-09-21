-- Aanvangstijd en datum van een poulewedstrijd automatisch doorzetten naar de
-- eigen wedstrijd.
--
-- Rogier vult de aanvangstijden in via Wedstrijden invoeren zodra ze bekend zijn,
-- vaak pas een paar weken vooraf. Die tijd kwam alleen in league_matches terecht;
-- er was een automatische doorzet voor de score (sync_league_score_to_match), niet
-- voor tijd of datum. Home, de verzamelbanner en het WhatsApp-bericht lezen de
-- eigen matches-rij, dus die bleven op "NTB" staan. Alleen "Genereer mijn
-- wedstrijden" nam de tijd mee -- een handmatige stap die makkelijk vergeten
-- wordt: rondes 5 en 6 kregen op 21 sep een tijd in de poule en bleven bij de
-- eigen wedstrijd leeg.
--
-- Dezelfde aanpak als bij de score: de database zet het door, zodat het niet
-- uitmaakt via welk scherm of welke codeversie de poulewedstrijd verandert.
--
-- Semantiek: de eigen wedstrijd VOLGT WIJZIGINGEN. Alleen een veld dat in de poule
-- echt verandert, wordt overgenomen -- ook het leegmaken van een tijd. Wat in de
-- poule niet wijzigt, laat de eigen wedstrijd met rust. Een lege datum wordt nooit
-- overgenomen (matches.match_date is NOT NULL).
--
-- De verzameltijd hoeft niet mee: die wordt live uitgerekend uit match_time
-- (src/lib/gathering.ts); matches.gathering_time wordt nergens gelezen.
--
-- Ook link_own_match_to_league_match() neemt nu de tijd mee bij het (her)koppelen.
-- Dat dekt het pad waarbij een ronde wordt verwijderd en opnieuw aangemaakt: de
-- versie van Wedstrijden invoeren die nu live staat doet precies dat.
--
-- Puur additief (nieuwe functie + trigger; de koppelfunctie wordt alleen ruimer).
-- Terugdraaien:
--   DROP TRIGGER trg_sync_league_schedule_to_match ON league_matches;
--   DROP FUNCTION sync_league_schedule_to_match();

CREATE OR REPLACE FUNCTION sync_league_schedule_to_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.match_date IS NOT DISTINCT FROM OLD.match_date
     AND NEW.match_time IS NOT DISTINCT FROM OLD.match_time THEN
    RETURN NEW;
  END IF;

  UPDATE matches m
     SET match_date = CASE
                        WHEN NEW.match_date IS DISTINCT FROM OLD.match_date AND NEW.match_date IS NOT NULL
                          THEN NEW.match_date::date
                        ELSE m.match_date
                      END,
         match_time = CASE
                        WHEN NEW.match_time IS DISTINCT FROM OLD.match_time
                          THEN NEW.match_time
                        ELSE m.match_time
                      END
   WHERE m.league_match_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_league_schedule_to_match ON league_matches;
CREATE TRIGGER trg_sync_league_schedule_to_match
  AFTER UPDATE OF match_date, match_time ON league_matches
  FOR EACH ROW EXECUTE FUNCTION sync_league_schedule_to_match();

REVOKE EXECUTE ON FUNCTION sync_league_schedule_to_match() FROM PUBLIC, anon, authenticated;

-- Koppelen neemt voortaan ook de tijd mee.
CREATE OR REPLACE FUNCTION link_own_match_to_league_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_team      uuid;
  v_home_own  boolean;
  v_away_own  boolean;
  v_match     uuid;
  v_kandidaten integer;
BEGIN
  IF NEW.match_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM matches WHERE league_match_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT team_id INTO v_team FROM leagues WHERE id = NEW.league_id;
  IF v_team IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(is_own_team, false) INTO v_home_own FROM league_teams WHERE id = NEW.home_team_id;
  SELECT coalesce(is_own_team, false) INTO v_away_own FROM league_teams WHERE id = NEW.away_team_id;
  IF NOT coalesce(v_home_own, false) AND NOT coalesce(v_away_own, false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*), (array_agg(m.id))[1]
    INTO v_kandidaten, v_match
    FROM matches m
   WHERE m.team_id = v_team
     AND m.league_match_id IS NULL
     AND m.match_date = NEW.match_date::date
     AND m.is_home = coalesce(v_home_own, false);

  IF v_kandidaten <> 1 THEN
    RETURN NEW;
  END IF;

  UPDATE matches
     SET league_match_id = NEW.id,
         match_time = coalesce(NEW.match_time, match_time),
         score_home = coalesce(NEW.score_home, score_home),
         score_away = coalesce(NEW.score_away, score_away),
         status = CASE WHEN NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL
                       THEN 'completed' ELSE status END
   WHERE id = v_match;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION link_own_match_to_league_match() FROM PUBLIC, anon, authenticated;

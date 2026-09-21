-- Eigen wedstrijd automatisch (her)koppelen aan zijn poulewedstrijd.
--
-- matches.league_match_id is ON DELETE SET NULL. Elke keer dat een poulewedstrijd
-- werd verwijderd en opnieuw aangemaakt, raakte de eigen wedstrijd zijn koppeling
-- kwijt. Gevolgen, allemaal stil:
--   - sync_league_score_to_match vindt niets, dus de uitslag komt niet door;
--   - onder Wedstrijden -> Hele poule verdwijnt het doelpuntenvak;
--   - Reistijden berekenen slaat de wedstrijd over.
-- Dat gebeurde in september drie keer met de hand gerepareerd; de hoofdoorzaak
-- (Wedstrijden invoeren wiste een ronde bij opslaan) is in dezelfde wijziging
-- weggenomen, maar "2e helft genereren" maakt rondes nog steeds opnieuw aan.
--
-- Deze trigger koppelt bij het aanmaken van een poulewedstrijd -- of zodra hij een
-- datum krijgt -- de eigen wedstrijd die erbij hoort, en neemt een eventuele
-- uitslag mee. Het criterium is hetzelfde dat twee keer met de hand is toegepast:
-- zelfde team, zelfde datum, zelfde kant (thuis/uit), nog ongekoppeld, en precies
-- één kandidaat. Bij nul of meer dan één doet hij niets: dan beslist een mens
-- (via "Genereer mijn wedstrijden").
--
-- Puur additief: een nieuwe functie en een nieuwe trigger. Terugdraaien:
--   DROP TRIGGER trg_link_own_match ON league_matches;
--   DROP FUNCTION link_own_match_to_league_match();

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

  -- Heeft deze poulewedstrijd al een eigen wedstrijd? Dan niets te doen.
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
    RETURN NEW;   -- ons team speelt hier niet
  END IF;

  SELECT count(*), (array_agg(m.id))[1]
    INTO v_kandidaten, v_match
    FROM matches m
   WHERE m.team_id = v_team
     AND m.league_match_id IS NULL
     AND m.match_date = NEW.match_date::date
     AND m.is_home = coalesce(v_home_own, false);

  IF v_kandidaten <> 1 THEN
    RETURN NEW;   -- geen of dubbelzinnig: niet raden
  END IF;

  UPDATE matches
     SET league_match_id = NEW.id,
         score_home = coalesce(NEW.score_home, score_home),
         score_away = coalesce(NEW.score_away, score_away),
         status = CASE WHEN NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL
                       THEN 'completed' ELSE status END
   WHERE id = v_match;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_own_match ON league_matches;
CREATE TRIGGER trg_link_own_match
  AFTER INSERT OR UPDATE OF match_date, home_team_id, away_team_id ON league_matches
  FOR EACH ROW EXECUTE FUNCTION link_own_match_to_league_match();

-- Een SECURITY DEFINER-functie krijgt standaard EXECUTE voor PUBLIC. Deze wordt
-- alleen door de trigger aangeroepen; niemand hoeft hem direct te kunnen draaien.
REVOKE EXECUTE ON FUNCTION link_own_match_to_league_match() FROM PUBLIC, anon, authenticated;

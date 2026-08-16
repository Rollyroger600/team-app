-- Multi-team fase 2, uitbreiding op verzoek (2026-08-16):
-- 1) 'match_day' toevoegen aan fluitbeurten_relative_to_match — veruit het meest
--    voorkomende geval ("op de wedstrijddag zelf thuis") stond er nog niet tussen; de
--    exacte fluittijd is toch vaak pas in de week zelf bekend, dus alleen de datum
--    (= wedstrijddatum) is hier relevant, geen dag-van-de-week-offset nodig.
ALTER TABLE teams DROP CONSTRAINT teams_fluitbeurten_relative_to_match_check;
ALTER TABLE teams ADD CONSTRAINT teams_fluitbeurten_relative_to_match_check
  CHECK (fluitbeurten_relative_to_match IN ('before', 'after', 'match_day'));

-- 2) Afronding van de verzameltijd instelbaar maken. Was hardcoded floor-naar-15-min
-- in calculateGatheringTime() ("always give extra time") — default 15 reproduceert
-- dat exact, dus geen zichtbare wijziging voor het huidige team.
ALTER TABLE teams ADD COLUMN gathering_rounding_minutes SMALLINT NOT NULL DEFAULT 15
  CHECK (gathering_rounding_minutes IN (0, 10, 15));

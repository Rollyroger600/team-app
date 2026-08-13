-- Eén eigen wedstrijd per poulewedstrijd.
--
-- Hoort bij de knop "Genereer mijn wedstrijden" in AdminLeagueMatches.tsx, die de
-- matches-rijen aanmaakt vanuit league_matches. Die dedupliceert al client-side (op
-- league_match_id, of op datum + tegenstander wanneer de koppeling verbroken is doordat
-- de 2e helft opnieuw is gegenereerd — matches.league_match_id is ON DELETE SET NULL).
-- Deze index is het vangnet daaronder.
--
-- Partieel, want losse wedstrijden (oefen- en bekerduels) hebben terecht geen koppeling
-- en moeten met z'n allen NULL kunnen zijn.
CREATE UNIQUE INDEX IF NOT EXISTS matches_league_match_id_key
  ON matches (league_match_id)
  WHERE league_match_id IS NOT NULL;

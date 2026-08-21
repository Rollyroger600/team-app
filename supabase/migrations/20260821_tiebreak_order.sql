-- Per team instelbare volgorde waarin gelijke punten worden ontknoopt.
--
-- Stond hardgecodeerd in MiniStandings. Instelbaar omdat het per bond,
-- competitie en sport verschilt -- de ene competitie kijkt eerst naar doelsaldo,
-- de andere eerst naar het onderlinge resultaat.
--
-- De default reproduceert exact de oude, hardgecodeerde volgorde. 'goals_against'
-- staat er als vijfde achter: dat criterium bestond nog niet en komt alleen aan
-- bod als alle vier ervoor gelijk zijn, waar de sortering voorheen op de fysieke
-- rijvolgorde terugviel.
--
-- Wie hem mag wijzigen regelt de bestaande trigger enforce_team_owner_only_settings
-- vanzelf: die faalt gesloten op elke kolom van `teams`, dus dit is automatisch
-- alleen-Hoofdbeheerder. Geen aparte policy nodig.
--
-- Puur additief: `git revert` van de code laat deze kolom ongebruikt achter.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS tiebreak_order TEXT[] NOT NULL
    DEFAULT ARRAY['wins','goal_difference','goals_for','head_to_head','goals_against']::text[];

COMMENT ON COLUMN teams.tiebreak_order IS
  'Volgorde van de tiebreak-criteria bij gelijke punten. Punten zelf staan altijd voorop en zitten er niet in. Zie src/lib/standings.ts.';

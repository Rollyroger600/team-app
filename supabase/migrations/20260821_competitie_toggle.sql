-- Stap 2: per-team toggle voor de competitie/poule-weergave.
--
-- Default TRUE, dus het huidige gedrag blijft voor elk bestaand team exact gelijk.
-- Uit betekent: geen poule-tabs, geen stand, geen competitie-tegels in Admin. De
-- eigen wedstrijdenlijst blijft altijd zichtbaar -- die hangt aan `matches`, niet
-- aan een league.
--
-- Puur additief: `git revert` van de code laat deze kolom ongebruikt achter en
-- verandert niets aan de werking.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS competitie_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN teams.competitie_enabled IS
  'Toont de poule-weergave (Hele poule-tab, stand, competitie-admin). Uit = alleen eigen wedstrijden.';

-- Doelpunt van een invaller/niet-teamlid.
--
-- Een invaller heeft geen profile en staat dus niet in team_memberships, waardoor
-- zijn doelpunt niet te registreren was: `goals.scorer_id` verwijst naar profiles.
-- In plaats van een nep-speler aan te maken (die dan ook in de namenkiezer bij
-- login, beschikbaarheid, Potjescup en de opkomstmatrix zou opduiken) krijgt het
-- doelpunt hier een vrije naam: scorer_id blijft NULL en external_scorer bevat
-- het label ('Invaller'). De assist blijft een echte teamgenoot (assist_id).
--
-- src/lib/stats.ts aggregeert deze doelpunten onder een synthetische rij
-- 'extern:<label>', zodat de topscorerslijst een extra regel "Invaller" krijgt.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS external_scorer TEXT;

-- Of een echte speler, of een externe naam — nooit beide.
ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_external_scorer_check;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_external_scorer_check
  CHECK (external_scorer IS NULL OR scorer_id IS NULL);

COMMENT ON COLUMN public.goals.external_scorer IS
  'Naam van een schutter zonder profile (invaller). Alleen gevuld als scorer_id NULL is.';

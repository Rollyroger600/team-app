-- Potjescup: naast 0 / 0,5 / 1 ook een eigen puntenaantal, 0 t/m 9.
--
-- Spelers verdienen soms extra punten. De oude CHECK liet alleen 0, 0.5 en 1 toe;
-- de kolom zelf (numeric(3,1)) kon altijd al meer aan.
--
-- De nieuwe regel is een strikte uitbreiding van de oude: alles wat eerst mocht,
-- mag nog steeds. Oude code werkt er dus ongewijzigd tegen, en de migratie kan
-- vóór de nieuwe frontend live. Halve punten blijven toegestaan boven de 1 (2,5),
-- omdat de halve punt al bestond voor wie tijdens de eindpartij van kant wisselde.
--
-- parsePotjescupPoints() in src/lib/potjescup.ts hanteert exact dezelfde grens.
--
-- Terugdraaien kan alleen zolang er nog geen rij buiten {0, 0.5, 1} staat:
--   ALTER TABLE potjescup_scores DROP CONSTRAINT potjescup_scores_points_check;
--   ALTER TABLE potjescup_scores ADD CONSTRAINT potjescup_scores_points_check
--     CHECK (points = ANY (ARRAY[0, 0.5, 1]::numeric[]));

ALTER TABLE potjescup_scores DROP CONSTRAINT IF EXISTS potjescup_scores_points_check;

ALTER TABLE potjescup_scores ADD CONSTRAINT potjescup_scores_points_check
  CHECK (points >= 0 AND points <= 9 AND points * 2 = trunc(points * 2));

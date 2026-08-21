-- Stap 3: trainingen met aanwezigheid.
--
-- Bewust GEEN training_schedules-tabel. Een cadans-tabel (rij per weekdag +
-- interval + geldigheidsperiode) is een mini-RRULE: `interval_weeks` heeft een
-- ankerdatum nodig die nooit mag wijzigen, een cadanswijziging halverwege het
-- seizoen betekent één rij sluiten en één openen, en de generator moet beide
-- respecteren én reconciliëren met wat er al staat. Veel machinerie voor "we
-- trainen op dinsdag".
--
-- In plaats daarvan: de gegenereerde rijen ZIJN het schema. De cadans staat in het
-- generatordialoog als niet-opgeslagen formulierstaat; op `teams` staan alleen de
-- standaarden die dat dialoog voorvullen. Zelfde model als "2e helft genereren"
-- in AdminLeagueMatches: een generator plus idempotentie, geen regeltabel.
--
-- Dat lost de rechtenvraag gratis op: `teams.training_*` is via de fail-closed
-- trigger enforce_team_owner_only_settings automatisch Hoofdbeheerder-only, en
-- `trainings`-rijen zijn via gewone RLS beheerder-schrijfbaar. Precies het
-- gevraagde model, met nul nieuwe machinerie.
--
-- Puur additief. trainingen_enabled staat default UIT, dus niemand ziet er iets
-- van tot een Hoofdbeheerder hem aanzet.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS trainingen_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_default_weekday SMALLINT
    CHECK (training_default_weekday BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS training_default_time TIME,
  ADD COLUMN IF NOT EXISTS training_default_duration_minutes SMALLINT NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS training_interval_weeks SMALLINT NOT NULL DEFAULT 1
    CHECK (training_interval_weeks BETWEEN 1 AND 4);

COMMENT ON COLUMN teams.training_default_weekday IS
  '0 = zondag .. 6 = zaterdag, zoals JavaScript getDay(). Alleen voorvulling van het generatordialoog.';

CREATE TABLE IF NOT EXISTS trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  training_date DATE NOT NULL,
  -- NOT NULL is load-bearing: Postgres ziet twee NULL's als verschillend, dus met
  -- een nullable start_time dedupliceert de UNIQUE hieronder niet meer en levert
  -- een tweede klik op "genereren" dubbele trainingen op.
  start_time TIME NOT NULL,
  end_time TIME,
  location TEXT,
  notes TEXT,
  -- Afgelast blijft staan in plaats van verwijderd worden: dan overleven de
  -- antwoorden en wekt hergeneratie de training niet opnieuw op.
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','cancelled')),
  -- Ad-hoc toegevoegde trainingen mogen nooit door de opruimstap van de generator
  -- geraakt worden.
  generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (team_id, training_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_trainings_team_date ON trainings(team_id, training_date);

CREATE TABLE IF NOT EXISTS training_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Bewust GEEN 'rostered_off': uitgeroosterd worden slaat op een
  -- wedstrijdselectie, niet op een training.
  status TEXT NOT NULL CHECK (status IN ('available','unavailable','injured')),
  responded_at TIMESTAMPTZ DEFAULT now(),
  overridden BOOLEAN NOT NULL DEFAULT false,
  set_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (training_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_training_attendance_training ON training_attendance(training_id);
CREATE INDEX IF NOT EXISTS idx_training_attendance_player   ON training_attendance(player_id);

ALTER TABLE trainings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_attendance ENABLE ROW LEVEL SECURITY;

-- ── RLS: trainings is een directe team_id-tabel ──────────────────────────────
CREATE POLICY "Team members can view trainings" ON trainings
  FOR SELECT USING (
    (SELECT is_team_member(trainings.team_id))
    OR (SELECT is_team_admin(trainings.team_id))
    OR (SELECT is_club_admin_for_team(trainings.team_id))
  );

CREATE POLICY "Team admins can insert trainings" ON trainings
  FOR INSERT WITH CHECK (
    (SELECT is_team_admin(trainings.team_id))
    OR (SELECT is_club_admin_for_team(trainings.team_id))
  );

CREATE POLICY "Team admins can update trainings" ON trainings
  FOR UPDATE USING (
    (SELECT is_team_admin(trainings.team_id))
    OR (SELECT is_club_admin_for_team(trainings.team_id))
  ) WITH CHECK (
    (SELECT is_team_admin(trainings.team_id))
    OR (SELECT is_club_admin_for_team(trainings.team_id))
  );

CREATE POLICY "Team admins can delete trainings" ON trainings
  FOR DELETE USING (
    (SELECT is_team_admin(trainings.team_id))
    OR (SELECT is_club_admin_for_team(trainings.team_id))
  );

-- ── RLS: training_attendance is een kindtabel ────────────────────────────────
-- Zelfde drieledige overlap als match_availability: je eigen rij, of teamlid, of
-- beheerder. WITH CHECK gelijk aan USING op de UPDATE -- zonder dat kan een speler
-- zijn eigen rij herschrijven naar de naam van iemand anders (USING slaagt, want
-- op dat moment ís het zijn rij). Zie de gotcha in CLAUDE.md.
CREATE POLICY "Team members can view training attendance" ON training_attendance
  FOR SELECT USING (
    player_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM trainings t
      WHERE t.id = training_attendance.training_id
        AND ((SELECT is_team_member(t.team_id))
             OR (SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  );

CREATE POLICY "Players and admins can insert training attendance" ON training_attendance
  FOR INSERT WITH CHECK (
    player_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM trainings t
      WHERE t.id = training_attendance.training_id
        AND ((SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  );

CREATE POLICY "Players and admins can update training attendance" ON training_attendance
  FOR UPDATE USING (
    player_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM trainings t
      WHERE t.id = training_attendance.training_id
        AND ((SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  ) WITH CHECK (
    player_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM trainings t
      WHERE t.id = training_attendance.training_id
        AND ((SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  );

CREATE POLICY "Players and admins can delete training attendance" ON training_attendance
  FOR DELETE USING (
    player_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM trainings t
      WHERE t.id = training_attendance.training_id
        AND ((SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  );

-- Live meekijken, net als bij match_availability: dit is een homescherm-app, dus
-- "wie komt er trainen" moet bijwerken terwijl iemand anders antwoordt.
ALTER PUBLICATION supabase_realtime ADD TABLE training_attendance;

-- Nu gratis, later pijnlijk: een Potjescup-sessie is per definitie "één per
-- trainingsdatum". Zonder deze koppeling voert een beheerder elke training twee
-- keer in. De UI gebruikt hem nog niet; de kolom kost niets en bespaart later een
-- migratie op een tabel met echte punten erin.
ALTER TABLE potjescup_sessions
  ADD COLUMN IF NOT EXISTS training_id UUID REFERENCES trainings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_potjescup_sessions_training ON potjescup_sessions(training_id);

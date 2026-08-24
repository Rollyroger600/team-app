-- Stap 4, herzien: inlegrondes met een bedrag per speler.
--
-- De eerste opzet had één `teams.kitty_expected_cents`: één verwacht bedrag voor
-- het hele team. Dat bleek niet te kloppen met de praktijk. Er wordt meerdere keren
-- per seizoen ingelegd, en het bedrag verschilt per persoon -- een speler die een
-- half jaar geblesseerd is betaalt de helft.
--
-- Dus: een INLEGRONDE ("iedereen €200 voorschot", "toernooibijdrage") met een
-- regel per speler. Wie niet meedoet heeft geen regel; wie de helft betaalt heeft
-- een regel met de helft. Wat iemand verschuldigd is, is de som van zijn regels.
--
-- Daarmee vervalt kitty_expected_cents. De kolom blijft staan (migraties zijn
-- additief, en droppen zou een terugval breken) maar wordt door de app niet meer
-- gelezen -- zie de COMMENT onderaan.
--
-- Verrekening gaat vanzelf: saldo = gestort + voorgeschoten − aandeel − verschuldigd.
-- Wie €50 voorschoot heeft €50 tegoed, en bij de volgende inleg van €100 staat er
-- dus nog €50 open. Precies "dan hoeft die persoon minder in te leggen".

CREATE TABLE IF NOT EXISTS pot_levies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  levy_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pot_levies_team ON pot_levies(team_id, levy_date);

CREATE TABLE IF NOT EXISTS pot_levy_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  levy_id UUID NOT NULL REFERENCES pot_levies(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- 0 is toegestaan: "meedoen maar niets betalen" is een geldige uitzondering en
  -- leest duidelijker dan de regel weglaten.
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (levy_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pot_levy_shares_levy ON pot_levy_shares(levy_id);
CREATE INDEX IF NOT EXISTS idx_pot_levy_shares_player ON pot_levy_shares(player_id);

ALTER TABLE pot_levies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pot_levy_shares  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view levies" ON pot_levies
  FOR SELECT USING (
    (SELECT is_team_member(pot_levies.team_id))
    OR (SELECT is_team_admin(pot_levies.team_id))
    OR (SELECT is_club_admin_for_team(pot_levies.team_id))
  );

CREATE POLICY "Team admins can insert levies" ON pot_levies
  FOR INSERT WITH CHECK (
    (SELECT is_team_admin(pot_levies.team_id))
    OR (SELECT is_club_admin_for_team(pot_levies.team_id))
  );

-- WITH CHECK gelijk aan USING, zoals overal sinds fase 0.6.
CREATE POLICY "Team admins can update levies" ON pot_levies
  FOR UPDATE USING (
    (SELECT is_team_admin(pot_levies.team_id))
    OR (SELECT is_club_admin_for_team(pot_levies.team_id))
  ) WITH CHECK (
    (SELECT is_team_admin(pot_levies.team_id))
    OR (SELECT is_club_admin_for_team(pot_levies.team_id))
  );

CREATE POLICY "Team admins can delete levies" ON pot_levies
  FOR DELETE USING (
    (SELECT is_team_admin(pot_levies.team_id))
    OR (SELECT is_club_admin_for_team(pot_levies.team_id))
  );

CREATE POLICY "Team members can view levy shares" ON pot_levy_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pot_levies l
      WHERE l.id = pot_levy_shares.levy_id
        AND ((SELECT is_team_member(l.team_id))
             OR (SELECT is_team_admin(l.team_id))
             OR (SELECT is_club_admin_for_team(l.team_id)))
    )
  );

CREATE POLICY "Team admins can insert levy shares" ON pot_levy_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pot_levies l
      WHERE l.id = pot_levy_shares.levy_id
        AND ((SELECT is_team_admin(l.team_id))
             OR (SELECT is_club_admin_for_team(l.team_id)))
    )
  );

CREATE POLICY "Team admins can update levy shares" ON pot_levy_shares
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pot_levies l
      WHERE l.id = pot_levy_shares.levy_id
        AND ((SELECT is_team_admin(l.team_id))
             OR (SELECT is_club_admin_for_team(l.team_id)))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM pot_levies l
      WHERE l.id = pot_levy_shares.levy_id
        AND ((SELECT is_team_admin(l.team_id))
             OR (SELECT is_club_admin_for_team(l.team_id)))
    )
  );

CREATE POLICY "Team admins can delete levy shares" ON pot_levy_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pot_levies l
      WHERE l.id = pot_levy_shares.levy_id
        AND ((SELECT is_team_admin(l.team_id))
             OR (SELECT is_club_admin_for_team(l.team_id)))
    )
  );

-- Een storting mag naar een inlegronde wijzen, zodat "voldaan" traceerbaar is.
-- Nullable: een losse storting hoort bij geen enkele ronde.
ALTER TABLE pot_transactions
  ADD COLUMN IF NOT EXISTS levy_id UUID REFERENCES pot_levies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pot_transactions_levy ON pot_transactions(levy_id);

COMMENT ON COLUMN teams.kitty_expected_cents IS
  'VERVALLEN. Verwachte inleg staat nu per speler in pot_levy_shares, omdat er meerdere keren per seizoen wordt ingelegd en het bedrag per persoon verschilt. Kolom blijft staan omdat migraties additief zijn; de app leest hem niet meer.';

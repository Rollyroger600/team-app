-- Teamkas: standaard alleen voor beheerders, met een schakelaar om hem voor het
-- hele team open te zetten.
--
-- Dit wordt NIET in de UI geregeld. Een tab verbergen bewijst niets: de anon key
-- zit in de frontend-bundel en een REST-aanroep zou de boekingen gewoon ophalen.
-- Zelfde les als bij enforce_admin_only_rostered_off -- als het echt niet gezien
-- mag worden, moet RLS het weigeren.
--
-- Vandaar: de SELECT-policies lezen teams.kitty_visible_to_players. Beheerders
-- zien altijd alles; gewone teamleden alleen als de Hoofdbeheerder dat aanzet.
--
-- Puur additief; de kolom staat default op false, dus na deze migratie ziet
-- niemand behalve beheerders de kas.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS kitty_visible_to_players BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN teams.kitty_visible_to_players IS
  'Uit = alleen beheerders zien de teamkas. Wordt door RLS afgedwongen, niet alleen door de UI.';

-- ── pot_transactions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team members can view pot transactions" ON pot_transactions;
CREATE POLICY "Kitty readers can view pot transactions" ON pot_transactions
  FOR SELECT USING (
    (SELECT is_team_admin(pot_transactions.team_id))
    OR (SELECT is_club_admin_for_team(pot_transactions.team_id))
    OR (
      (SELECT is_team_member(pot_transactions.team_id))
      AND EXISTS (
        SELECT 1 FROM teams t
        WHERE t.id = pot_transactions.team_id AND t.kitty_visible_to_players
      )
    )
  );

-- ── pot_transaction_shares ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team members can view pot shares" ON pot_transaction_shares;
CREATE POLICY "Kitty readers can view pot shares" ON pot_transaction_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pot_transactions tr
      JOIN teams t ON t.id = tr.team_id
      WHERE tr.id = pot_transaction_shares.transaction_id
        AND ((SELECT is_team_admin(tr.team_id))
             OR (SELECT is_club_admin_for_team(tr.team_id))
             OR ((SELECT is_team_member(tr.team_id)) AND t.kitty_visible_to_players))
    )
  );

-- ── pot_levies ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team members can view levies" ON pot_levies;
CREATE POLICY "Kitty readers can view levies" ON pot_levies
  FOR SELECT USING (
    (SELECT is_team_admin(pot_levies.team_id))
    OR (SELECT is_club_admin_for_team(pot_levies.team_id))
    OR (
      (SELECT is_team_member(pot_levies.team_id))
      AND EXISTS (
        SELECT 1 FROM teams t
        WHERE t.id = pot_levies.team_id AND t.kitty_visible_to_players
      )
    )
  );

-- ── pot_levy_shares ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Team members can view levy shares" ON pot_levy_shares;
CREATE POLICY "Kitty readers can view levy shares" ON pot_levy_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pot_levies l
      JOIN teams t ON t.id = l.team_id
      WHERE l.id = pot_levy_shares.levy_id
        AND ((SELECT is_team_admin(l.team_id))
             OR (SELECT is_club_admin_for_team(l.team_id))
             OR ((SELECT is_team_member(l.team_id)) AND t.kitty_visible_to_players))
    )
  );

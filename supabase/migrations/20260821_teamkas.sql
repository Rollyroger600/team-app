-- Stap 4: teamkas / bierpot.
--
-- Eén pot per team, alle beheerders mogen boeken, alle teamleden zien alles -- die
-- sociale transparantie ís het nut van een bierpot.
--
-- Twee soorten boekingen, en `paid_by` doet het zware werk:
--
--   contribution + paid_by = X   X stortte geld in de pot
--   expense     + paid_by = NULL uit de pot betaald (bierrekening)
--   expense     + paid_by = X    X schoot voor -- kassaldo onaangeroerd, X krijgt tegoed
--
-- Rogiers scenario's dekt dat zonder een derde type:
--   - 22x EUR 200 voorschot        -> 22 contributions, kitty_expected_cents = 20000
--   - tussentijds EUR 100 bijstorten -> kitty_expected_cents naar 30000; openstaand
--                                    per speler wordt automatisch EUR 100
--   - maandelijkse bierrekening    -> expense, paid_by NULL, geen shares
--   - iemand schiet ballen voor    -> expense met paid_by, geen shares
--   - teamdiner voor 8 van de 22   -> expense + 8 shares
--
-- Puur additief, en kitty_enabled staat default UIT.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS kitty_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kitty_name TEXT NOT NULL DEFAULT 'Bierpot',
  -- Verwachte inleg per actieve speler. Tussentijds bijstorten = dit bedrag
  -- verhogen; "openstaand" is altijd verwacht min gestort.
  ADD COLUMN IF NOT EXISTS kitty_expected_cents INTEGER NOT NULL DEFAULT 0
    CHECK (kitty_expected_cents >= 0);

CREATE TABLE IF NOT EXISTS pot_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('contribution','expense')),
  -- Integer centen, geen NUMERIC: dan blijft elke som, splitsing en restcent in
  -- gehele getallen en raakt er nooit een float aan te pas.
  -- Het teken zit in `type`, nooit in het bedrag -- anders is elke som een valkuil.
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Wie stortte, of wie voorschoot.
  paid_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Een storting zonder storter is betekenisloos; een uitgave zonder betaler is
  -- juist de normale situatie (uit de pot).
  CONSTRAINT contribution_needs_payer CHECK (type <> 'contribution' OR paid_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pot_transactions_team ON pot_transactions(team_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_pot_transactions_paid_by ON pot_transactions(paid_by);

-- Geen shares op een uitgave = betaald uit de collectieve pot.
-- Wél shares = déze spelers dragen die uitgave, cent-exact verdeeld.
CREATE TABLE IF NOT EXISTS pot_transaction_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES pot_transactions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  share_cents INTEGER NOT NULL CHECK (share_cents >= 0),
  UNIQUE (transaction_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pot_shares_transaction ON pot_transaction_shares(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pot_shares_player ON pot_transaction_shares(player_id);

ALTER TABLE pot_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pot_transaction_shares ENABLE ROW LEVEL SECURITY;

-- Alle teamleden zien alles; alleen beheerders boeken.
CREATE POLICY "Team members can view pot transactions" ON pot_transactions
  FOR SELECT USING (
    (SELECT is_team_member(pot_transactions.team_id))
    OR (SELECT is_team_admin(pot_transactions.team_id))
    OR (SELECT is_club_admin_for_team(pot_transactions.team_id))
  );

CREATE POLICY "Team admins can insert pot transactions" ON pot_transactions
  FOR INSERT WITH CHECK (
    (SELECT is_team_admin(pot_transactions.team_id))
    OR (SELECT is_club_admin_for_team(pot_transactions.team_id))
  );

-- BEWUST GEEN UPDATE-POLICY in v1. Een fout corrigeer je door te verwijderen en
-- opnieuw in te voeren. Dat houdt created_by een echt auditspoor, en het omzeilt
-- de hele ontbrekende-WITH-CHECK-klasse fouten op precies de tabel waar geld staat.
CREATE POLICY "Team admins can delete pot transactions" ON pot_transactions
  FOR DELETE USING (
    (SELECT is_team_admin(pot_transactions.team_id))
    OR (SELECT is_club_admin_for_team(pot_transactions.team_id))
  );

CREATE POLICY "Team members can view pot shares" ON pot_transaction_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pot_transactions t
      WHERE t.id = pot_transaction_shares.transaction_id
        AND ((SELECT is_team_member(t.team_id))
             OR (SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  );

CREATE POLICY "Team admins can insert pot shares" ON pot_transaction_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pot_transactions t
      WHERE t.id = pot_transaction_shares.transaction_id
        AND ((SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  );

CREATE POLICY "Team admins can delete pot shares" ON pot_transaction_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pot_transactions t
      WHERE t.id = pot_transaction_shares.transaction_id
        AND ((SELECT is_team_admin(t.team_id))
             OR (SELECT is_club_admin_for_team(t.team_id)))
    )
  );

COMMENT ON TABLE pot_transactions IS
  'Teamkas. Saldi worden client-side afgeleid in src/lib/kitty.ts -- geen view, zie CLAUDE.md over security_invoker.';

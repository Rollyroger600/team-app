-- Stap 1c: persoonlijke toegangscodes.
--
-- Elke rosterplek krijgt een eigen code. De link /i/<code> weet wie je bent, dus
-- het inlogscherm hoeft geen namenlijst meer te tonen -- vandaag geeft dat scherm
-- de voornamen van alle 22 spelers aan iedereen die de app opent.
--
-- De code is een IDENTIFIER, geen geheim: hij blijft van jou zoals een
-- gebruikersnaam, de PIN blijft het geheim. Uitgelekt of kwijt? De beheerder maakt
-- een nieuwe aan en de oude vervalt.
--
-- Puur additief: nieuwe tabel, nieuwe functie. De bestaande loginflow blijft
-- ongemoeid en werkt gewoon door -- bewuste keuze, zie de commit-boodschap. Pas
-- als iedereen via zijn link binnen is gekomen gaat de namenlijst eruit (1-S-b).

CREATE TABLE IF NOT EXISTS team_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  -- Vóór activatie staat hier alleen de naam die de beheerder invoerde en is
  -- player_id NULL. Bij activatie ontstaat er een account (of wordt een bestaand
  -- account gekoppeld) en komt de team_memberships-rij erbij. De rij blijft
  -- daarna bestaan als vaste inlogroute.
  display_name TEXT NOT NULL,
  jersey_number SMALLINT,
  role TEXT NOT NULL DEFAULT 'player'
    CHECK (role IN ('player','team_admin','team_owner')),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  activated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  -- Alleen zinvol zolang de code nog niet geactiveerd is: een openstaande
  -- uitnodiging is overneembaar door iedereen die de link heeft, een geactiveerde
  -- niet meer.
  invite_expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_team_access_codes_team_id   ON team_access_codes(team_id);
CREATE INDEX IF NOT EXISTS idx_team_access_codes_player_id ON team_access_codes(player_id);

ALTER TABLE team_access_codes ENABLE ROW LEVEL SECURITY;

-- Beheerders zien en beheren de codes van hun eigen team; een speler ziet zijn
-- eigen rij. Geen anon-policy: een code oplossen loopt via de edge function met de
-- service role, zodat een willekeurige bezoeker niets kan opsommen.
CREATE POLICY "Admins and owner can view access codes" ON team_access_codes
  FOR SELECT USING (
    player_id = (SELECT auth.uid())
    OR (SELECT is_team_admin(team_access_codes.team_id))
    OR (SELECT is_club_admin_for_team(team_access_codes.team_id))
  );

CREATE POLICY "Team admins can insert access codes" ON team_access_codes
  FOR INSERT WITH CHECK (
    (SELECT is_team_admin(team_access_codes.team_id))
    OR (SELECT is_club_admin_for_team(team_access_codes.team_id))
  );

-- WITH CHECK met dezelfde expressie als USING: zonder dat kan een beheerder een
-- rij naar een ander team schrijven. Zie de gotcha in CLAUDE.md.
CREATE POLICY "Team admins can update access codes" ON team_access_codes
  FOR UPDATE USING (
    (SELECT is_team_admin(team_access_codes.team_id))
    OR (SELECT is_club_admin_for_team(team_access_codes.team_id))
  ) WITH CHECK (
    (SELECT is_team_admin(team_access_codes.team_id))
    OR (SELECT is_club_admin_for_team(team_access_codes.team_id))
  );

CREATE POLICY "Team admins can delete access codes" ON team_access_codes
  FOR DELETE USING (
    (SELECT is_team_admin(team_access_codes.team_id))
    OR (SELECT is_club_admin_for_team(team_access_codes.team_id))
  );

-- ── Codegeneratie ────────────────────────────────────────────────────────────
--
-- 10 tekens uit een alfabet van 31: geen I, O, L, 0 of 1, want dat zijn de tekens
-- die bij overtypen door elkaar gehaald worden.
--
-- 31 deelt niet in 256, dus `byte % 31` zou de eerste acht letters vaker opleveren.
-- Vandaar de verwerping: bytes vanaf 248 (8*31) worden weggegooid en er wordt een
-- nieuwe getrokken. Dat kost gemiddeld 3% extra trekkingen en houdt de verdeling
-- gelijk. 31^10 is ruim 8*10^14 mogelijkheden -- en de code is sowieso geen geheim
-- maar een identifier; de PIN blijft het geheim.
CREATE OR REPLACE FUNCTION public.generate_access_code()
 RETURNS TEXT
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31 tekens
  v_limit    CONSTANT INT  := 248;  -- 8 * 31; alles daarboven verwerpen
  v_code TEXT;
  v_byte INT;
BEGIN
  LOOP
    v_code := '';
    WHILE length(v_code) < 10 LOOP
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      CONTINUE WHEN v_byte >= v_limit;
      v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
    END LOOP;
    -- Botsing is met 10^15 mogelijkheden theoretisch, maar de UNIQUE-index is de
    -- waarheid; opnieuw proberen is goedkoper dan erop gokken.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM team_access_codes WHERE code = v_code);
  END LOOP;
  RETURN v_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_access_code() FROM PUBLIC, anon;

-- ── Overgang voor de bestaande leden ─────────────────────────────────────────
--
-- Zij hebben al een account en PIN, maar nog geen code. Elk actief lidmaatschap
-- krijgt er een, meteen met activated_at gevuld zodat de code direct als
-- inlogroute werkt en niet als openstaande uitnodiging telt. Niemand merkt er iets
-- van tot hij van toestel wisselt; vanaf dan stuur je die persoon zijn link.
INSERT INTO team_access_codes (team_id, code, display_name, jersey_number, role, player_id, activated_at, invite_expires_at)
SELECT tm.team_id,
       generate_access_code(),
       COALESCE(NULLIF(tm.display_name, ''), p.nickname, split_part(p.full_name, ' ', 1), 'Speler'),
       tm.jersey_number,
       tm.role,
       tm.player_id,
       now(),
       NULL
FROM team_memberships tm
JOIN profiles p ON p.id = tm.player_id
WHERE tm.active
  AND NOT EXISTS (
    SELECT 1 FROM team_access_codes tac
    WHERE tac.team_id = tm.team_id AND tac.player_id = tm.player_id
  );

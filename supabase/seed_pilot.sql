-- ============================================================
-- Seed: HC Leiden — Heren 30-1 pilot data
-- Draai dit NADAT schema.sql is uitgevoerd
-- ============================================================

-- ============================================================
-- STAP 1: HC Leiden toevoegen aan de gedeelde clubs_registry
-- ============================================================
INSERT INTO clubs_registry (id, name, short_name, address, latitude, longitude, primary_color, secondary_color, verified)
VALUES (
  '00000001-0000-0000-0000-000000000001',
  'HC Leiden',
  'HCL',
  'Hofbrouckerlaan 51a, 2341 LM Oegstgeest',
  52.1799,
  4.4469,
  '#1e3a5f',
  '#f59e0b',
  true
)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- STAP 2: HC Leiden als "eigen club" (tenant) aanmaken
-- ============================================================
INSERT INTO clubs (id, registry_id, name, short_name, primary_color, secondary_color)
VALUES (
  '00000002-0000-0000-0000-000000000001',
  '00000001-0000-0000-0000-000000000001',
  'HC Leiden',
  'HCL',
  '#1e3a5f',
  '#f59e0b'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STAP 3: Team "Heren 30-1" aanmaken
-- ============================================================
INSERT INTO teams (id, club_id, name, season, gathering_lead_time, travel_buffer_minutes, match_squad_size)
VALUES (
  '00000003-0000-0000-0000-000000000001',
  '00000002-0000-0000-0000-000000000001',
  'Heren 30-1',
  '2025-2026',
  30,
  10,
  16
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STAP 4: Rogier als admin instellen
-- Vervang <JOUW_USER_UUID> met je echte auth UUID
-- (Supabase → Authentication → Users → kopieer de UUID)
-- ============================================================

-- UPDATE profiles
--   SET is_platform_admin = true,
--       full_name = 'Rogier'   -- pas aan naar je echte naam
--   WHERE id = '<JOUW_USER_UUID>';

-- INSERT INTO team_memberships (team_id, player_id, role)
-- VALUES (
--   '00000003-0000-0000-0000-000000000001',
--   '<JOUW_USER_UUID>',
--   'team_admin'
-- )
-- ON CONFLICT (team_id, player_id) DO UPDATE SET role = 'team_admin';

-- INSERT INTO club_memberships (club_id, player_id, role)
-- VALUES (
--   '00000002-0000-0000-0000-000000000001',
--   '<JOUW_USER_UUID>',
--   'club_admin'
-- )
-- ON CONFLICT (club_id, player_id) DO UPDATE SET role = 'club_admin';

-- ============================================================
-- OPTIONEEL: Bekende tegenstanders alvast in de registry
-- (kun je later via de app doen, maar handig om te pre-seeden)
-- ============================================================

-- INSERT INTO clubs_registry (name, short_name, address, latitude, longitude, verified)
-- VALUES
--   ('LDHC', 'LDHC', 'Leidse Hout, Leiden', 52.1674, 4.4833, false),
--   ('HC Roomburg', 'HCR', 'Roomburg, Leiden', 52.1500, 4.5100, false)
-- ON CONFLICT (name) DO NOTHING;

-- Fase 0.7: clubs.slug en teams.slug waren allebei NULL.
--
-- Die kolommen bestaan sinds 20260326_pin_auth.sql puur voor de deeplink
-- /login?club=<club>&team=<team>, die getPlayersForLogin() in de edge function
-- afhandelt via .eq('slug', ...). Met NULL-slugs kon die route nooit werken: elke
-- deeplink gaf "Club niet gevonden". Na deze migratie geeft
-- club_slug=lohc-leiden + team_slug=heren-30-1 gewoon de 22 spelers terug.
--
-- LET OP — nieuw sinds 20260820_settings_trigger_fail_closed.sql: die trigger is
-- fail-closed en een migratieverbinding heeft géén auth.uid() en géén service_role,
-- dus élke data-UPDATE op teams wordt vanuit een migratie geweigerd. Voor DDL
-- (ALTER TABLE ... ADD COLUMN) maakt dat niets uit — een row-trigger vuurt daar niet.
-- Alleen bij een echte UPDATE op teams moet je de trigger gericht even uitzetten,
-- zoals hieronder. Zelfde patroon als 20260814_team_owner_role.sql doet met
-- trg_prevent_unauthorized_role_change.
--
-- Er is nergens slug-generatie; teams krijgen er pas automatisch een zodra de
-- create_team-actie er is (stap 1 van de roadmap).
--
-- Let op voor multi-team: teams.slug is GLOBAAL uniek, niet uniek per club. Twee clubs
-- kunnen dus niet allebei een team met slug 'heren-1' hebben. Bij create_team moet de
-- slug daarom club-geprefixt of anderszins ontdubbeld worden.
UPDATE clubs SET slug = 'lohc-leiden'
 WHERE id = '00000002-0000-0000-0000-000000000001' AND slug IS NULL;

ALTER TABLE teams DISABLE TRIGGER enforce_team_owner_only_settings;
UPDATE teams SET slug = 'heren-30-1'
 WHERE id = '00000003-0000-0000-0000-000000000001' AND slug IS NULL;
ALTER TABLE teams ENABLE TRIGGER enforce_team_owner_only_settings;

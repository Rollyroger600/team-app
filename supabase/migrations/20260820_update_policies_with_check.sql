-- Fase 0.6: elke UPDATE-policy had wel USING maar geen WITH CHECK.
--
-- USING bepaalt wélke rijen je mag bijwerken; WITH CHECK bepaalt hoe de rij eruit mag
-- zien ná de update. Zonder WITH CHECK kon een speler zijn eigen rij op naam van een
-- ander zetten (`UPDATE match_availability SET player_id = <iemand anders>` — USING
-- slaagt want het is op dat moment zíjn rij) en kon een beheerder een wedstrijd naar
-- een ander team duwen. Onschuldig met één team, onacceptabel zodra er trainingen en
-- geld in de database staan.
--
-- Live geverifieerd op 2026-08-20: de player_id-omzetting geeft nu
-- "new row violates row-level security policy", terwijl een gewone statuswijziging
-- op dezelfde rij gewoon slaagt.
--
-- De WITH CHECK is exact dezelfde expressie als de USING. Bewust gegenereerd uit
-- pg_policies.qual in plaats van 18 complexe expressies over te typen — dat sluit
-- overtypfouten uit en houdt beide letterlijk in sync.
--
-- Terugdraaien: supabase/rollback/20260820_update_policies_with_check_down.sql
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'UPDATE' AND with_check IS NULL
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
      r.policyname, r.schemaname, r.tablename, r.qual, r.qual
    );
  END LOOP;
END $$;

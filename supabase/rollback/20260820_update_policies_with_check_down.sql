-- TERUGDRAAIEN van 20260820_update_policies_with_check.sql
--
-- Postgres kan een WITH CHECK niet "afzetten" met ALTER POLICY — je kunt 'm alleen
-- wijzigen. Verwijderen betekent dus DROP + CREATE. Alle 18 UPDATE-policies stonden op
-- rol PUBLIC (geverifieerd), dus de TO-clausule kan weg bij het opnieuw aanmaken.
--
-- Het hele blok draait in één transactie, dus de policies zijn nooit echt even weg.
--
-- Let op: hierna kan een speler zijn eigen rij weer op naam van een ander zetten en
-- kan een beheerder een rij naar een ander team verplaatsen. Alleen gebruiken als een
-- legitieme schrijfactie onverwacht 403 geeft, en repareer dan zo snel mogelijk
-- vooruit in plaats van dit te laten staan.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'UPDATE' AND with_check IS NOT NULL
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR UPDATE USING (%s)',
      r.policyname, r.schemaname, r.tablename, r.qual
    );
  END LOOP;
END $$;

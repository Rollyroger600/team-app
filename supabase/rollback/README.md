# Terugdraai-scripts

Bijna alle migraties in dit project zijn **puur additief** (`ADD COLUMN ... DEFAULT`,
`CREATE TABLE`). Die hoef je bij een terugval niet aan te raken: de oude code blijft
gewoon werken tegen het nieuwe schema, de extra kolommen staan er ongebruikt bij.
Terugvallen is dan alleen `git revert <merge-commit>` + push.

Deze map bevat de uitzonderingen: migraties die **bestaand gedrag wijzigen** en die je
dus apart moet terugdraaien als je de bijbehorende code terugdraait.

| Script | Draait terug | Wanneer nodig |
|---|---|---|
| `20260820_settings_trigger_fail_closed_down.sql` | Fase 0.5 — herstelt de kolom-voor-kolom trigger uit `20260816_..._v2.sql` | Als de fail-closed trigger een legitieme write blokkeert die we over het hoofd zagen |
| `20260820_update_policies_with_check_down.sql` | Fase 0.6 — haalt `WITH CHECK` weer van de UPDATE-policies | Als een bestaande schrijfactie onverwacht 403 geeft |

Uitvoeren via de Supabase SQL Editor of `supabase db execute`. Controleer daarna of het
probleem echt weg is — beide wijzigingen maken de beveiliging strikter, dus een fout
hier betekent meestal dat er ergens een write zit die we niet in beeld hadden.

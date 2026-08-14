-- Publieke bucket voor club-logo's die niet uit de externe 254-club bulk-import komen
-- (die logo's staan in een ander Supabase-project; zie clubs_registry.logo_url op de
-- meeste rijen). Mirrort dat patroon: publieke bucket, geen SELECT-policy nodig omdat
-- lezen via de aparte /storage/v1/object/public/<bucket>/<path>-route loopt, niet via RLS.
insert into storage.buckets (id, name, public)
values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

-- Geen INSERT/UPDATE/DELETE-policy toegevoegd: uploaden gebeurt eenmalig door een
-- admin met een tijdelijke policy (aangemaakt, gebruikt, weer verwijderd — zie
-- de sessie van 2026-08-14). Op een verse omgeving is de bucket dus leeg totdat er
-- bewust weer een keer bestanden in worden gezet.
--
-- Eerste bestand hierin: leidsche-en-oegstgeester-h-c.jpg (het LOHC-wapenschild),
-- bron ligt in hockeyclubs-pipeline/logos/ in deze repo, gekoppeld aan de "Leiden"-rij
-- in clubs_registry via logo_url.

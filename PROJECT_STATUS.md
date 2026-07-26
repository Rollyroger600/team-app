# Hockey Team App — Project Status

## Overzicht
PWA voor HC Leiden Heren 30-1. Multi-tenant architectuur (club → team), maar in de praktijk
draait dit voor precies één club/team. Pre-season pilot, nieuw seizoen start medio augustus 2026.
Live in productie, nog geen echte gebruikers buiten Rogier (platform_admin) tijdens de testfase.
Draait bij spelers als homescreen-PWA op hun telefoon.

- **Productie:** https://team-app-zeta.vercel.app (auto-deploy vanaf `main` via Vercel ↔ GitHub)
- **Supabase project:** `Team_APP_Pilot` (`fwsjcjyovqikxrzcbovw`)

---

## Tech Stack
| Laag | Keuze |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS v4 |
| Routing | React Router v7 |
| State | Zustand |
| Data fetching | TanStack Query |
| Database + Auth | Supabase (Postgres, GoTrue, Edge Functions, RLS, Realtime) |
| Hosting | Vercel (gekoppeld aan GitHub, auto-deploy op push naar `main`) |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| Charts | Recharts |
| E2E tests | Playwright |

---

## Implementatie Voortgang

### ✅ Gereed
- Volledige PIN-login + RBAC: `platform_admin` (Rogier, enige algehele admin) > `team_admin`
  ("Beheerder") > `player`, plus los "Aanvoerder"-label (`is_captain`, puur informatief). De
  vroegere aparte `club_admin`-laag is bewust samengevoegd met `platform_admin` — één team, geen
  reden meer voor onderscheid.
- Admin → Spelers: spelers toevoegen, PIN resetten, rol wijzigen ("Maak beheerder"), aanvoerder
  aan/uit, "inloggen als speler" (mint sessie zonder PIN nodig te hebben). Aparte "Beheerders"-pagina
  is verwijderd — overbodig, dit kon al via Spelers.
- Club/team-picker met auto-skip bij één keuze
- Wedstrijden: programma, uitslagen, doelpunten/kaarten invoer (VD/SC/SB-onderscheid), reistijd-
  en verzameltijd-berekening, Stand-widget (client-side berekend uit league_matches)
- **Beschikbaarheid**: spelers geven per wedstrijd aan (beschikbaar/niet/misschien), zichtbaar en
  aanpasbaar voor het **hele seizoen** (niet alleen aankomende wedstrijden) — "Al geweest"-sectie
  onder Meer. Beheerders kunnen ook de beschikbaarheid van andere spelers zetten/corrigeren
  (bijv. last-minute afzeggingen), overal met dezelfde `TeamAvailabilityList`-component.
- **Aanwezigheidsoverzicht** (Admin → Aanwezigheid): matrix speler × wedstrijd voor het hele
  seizoen, met totalen per wedstrijd en per speler — vervangt het handmatige Excel-overzicht.
- **Realtime**: beschikbaarheidsschermen (Home, Meer, wedstrijddetail, Aanwezigheidsoverzicht)
  verversen live via Supabase Realtime zodra iemand anders zijn status aanpast — geen handmatige
  refresh nodig, belangrijk op een homescreen-PWA.
- **Delen-bericht** op wedstrijddetail genereert automatisch het wekelijkse team-appje: dag/datum,
  tegenstander, tijden, en wie beschikbaar/afwezig/onbekend is (namen + totalen).
- Fluitbeurten: automatisch genereren per thuiswedstrijd, plus losse/handmatige fluitbeurten
  (datum + omschrijving + 2 spelers) voor wedstrijden buiten het reguliere schema.
- Uitroostering/opstelling (drag & drop) — bestaat, maar wordt voorlopig niet gebruikt in de app
  ("Bekijk opstelling"-link voor spelers is verwijderd; admin-kant blijft bestaan)
- **Potjescup**: wekelijks trainingspotje-scoresysteem. Admin legt per training (woensdag) 0/0.5/1
  punt per speler vast; podium + volledige ranglijst (alle actieve spelers vanaf dag 1, ook met 0
  punten) op `/potjescup`, incl. spelregels achter een info-icoon.
- Statistieken-pagina: totaaloverzicht (totaal doelpunten + uit corner), Topscorer- en MVP-podium,
  sorteerbare/uitklapbare spelerslijst met Gesp./VD/SC/SB/Goals/Ass. kolommen
- Dashboard toont dezelfde Topscorer/MVP podiums plus het Potjescup-podium (compacte variant)
- **Competitie-teams**: admins kunnen elk team in de poule een korte weergavenaam geven (i.p.v. de
  lange, uit het register geïmporteerde naam) — wordt overal in de app gebruikt waar die poule-
  teams getoond worden (Stand, wedstrijdkaarten, admin-dropdowns).
- Announcements (aankondigingen) met datum zichtbaar op het Dashboard
- Vercel deploy + CI (GitHub Actions, Playwright)

### Bekende openstaande punten
- [ ] Echte spelers/team-samenstelling nog definitief maken zodra seizoen start (medio augustus 2026)
- [ ] PWA icons/manifest polish
- [ ] Uitroostering/opstelling: bewust nog niet in gebruik, mogelijk later heractiveren

---

## Auth & RBAC architectuur (kern)
- Elke speler krijgt een "schaduw" Supabase Auth account (`{uuid}@team.internal` + willekeurig
  wachtwoord, opgeslagen in `player_credentials`); login gebeurt via een 4-6 cijferige PIN
  (bcrypt-hash in `player_credentials.pin_hash`, nooit plaintext, nooit herstelbaar)
- Alle auth-mutaties lopen via de edge function **`auth-handler`**
  (`supabase/functions/auth-handler/index.ts`): create_player, get_players_for_login, login,
  set_pin, reset_pin, change_pin, change_role, impersonate, set_captain, get_players_status
- RBAC hiërarchie: `platform_admin` > `team_admin` (`team_memberships.role`) > `player`, plus
  onafhankelijk `is_captain` boolean. `club_admin` bestaat als concept nog in het datamodel maar
  is functioneel gelijkgeschakeld aan `platform_admin` (zie CLAUDE.md).
- DB trigger `prevent_unauthorized_role_change` voorkomt dat een team_admin zichzelf via directe
  REST-calls promoveert; de service-role bypass gebruikt `auth.role() = 'service_role'`.
- Frontend haalt altijd een verse access token op (`getFreshAccessToken()` in `src/lib/auth.ts`)
  vóór elke admin-actie, om "niet geauthenticeerd" door verlopen tokens op achtergrond-tabs te
  voorkomen.

## Statistieken-logica
- Gedeelde hook `useTeamStats()` in `src/lib/stats.ts` (gebruikt door zowel Dashboard als Stats
  pagina, één cache) berekent per speler: `matches_played`, `fieldGoals` (VD), `cornerGoals` (SC),
  `penaltyGoals` (SB), `goals` (= som van de drie), `assists`
  - VD = doelpunt, strafcorner/strafbal niet aangevinkt bij uitslag
  - SC = doelpunt + strafcorner aangevinkt
  - SB = doelpunt + strafbal aangevinkt
- `topByGoals()` / `topByGoalsPlusAssists()` leveren top-3 voor de podiums; `usePotjescupStats()` /
  `topByPoints()` in `src/lib/potjescup.ts` doet hetzelfde voor de Potjescup-ranglijst
- `PodiumCard` component (`src/components/ui/MiniPodium.tsx`) is de generieke podium-bouwsteen,
  gebruikt voor Topscorer/MVP én Potjescup

## Beschikbaarheid & aanwezigheid
- `match_availability` dekt het hele seizoen, niet alleen aankomende wedstrijden — zowel Meer
  (Beschikbaarheid-tab, met "Al geweest"-sectie) als Admin → Aanwezigheid tonen historie.
- Beheerders kunnen andermans status zetten via `TeamAvailabilityList` (Dashboard, Meer,
  wedstrijddetail); admin-gezette rijen krijgen `overridden: true` + `set_by`.
- Live verversing via Supabase Realtime (`useRealtimeInvalidate` in `src/lib/realtime.ts`).

## Potjescup
- Regels: elke woensdag vóór een competitiewedstrijd wordt op de training gespeeld voor de
  potjescup (22 kansen per seizoen). Winnend team 1 punt, verliezend team 0. Min. 10 spelers
  aanwezig. Speler die halverwege van team wisselt krijgt 0,5 punt.
- Tabellen: `potjescup_sessions` (1 per trainingsdatum), `potjescup_scores` (1 per actieve speler
  per sessie). Admin-CRUD in `src/pages/admin/AdminPotjescup.tsx`.

---

## Supabase Setup
- **Project:** Team_APP_Pilot
- **URL:** https://fwsjcjyovqikxrzcbovw.supabase.co
- **Schema:** `supabase/schema.sql` + migraties in `supabase/migrations/`
- **Realtime:** ingeschakeld voor `match_availability` (via `supabase_realtime` publicatie)

## Pilot Data (HC Leiden — Heren 30-1)
- Club: "HC Leiden", Hofbrouckerlaan 51a, 2341 LM Oegstgeest
- Team: "Heren 30-1", seizoen 2025-2026 (enige actieve club/team; test-fixtures verwijderd)
- Rogier: platform_admin (enige beheerder tot seizoensstart; Marlof heeft ook Beheerder-rol +
  is aanvoerder)

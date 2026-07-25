# Hockey Team App — Project Status

## Overzicht
PWA voor HC Leiden Heren 30-1. Multi-tenant architectuur (club → team). Pre-season pilot,
nieuw seizoen start medio augustus 2026. Live in productie, nog geen echte gebruikers
buiten Rogier (platform_admin) tijdens de testfase.

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
| Database + Auth | Supabase (Postgres, GoTrue, Edge Functions, RLS) |
| Hosting | Vercel (gekoppeld aan GitHub, auto-deploy op push naar `main`) |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| Charts | Recharts |
| E2E tests | Playwright |

---

## Implementatie Voortgang

### ✅ Gereed
- Volledige PIN-login + 4-niveau RBAC (platform_admin / club_admin / team_admin / player),
  incl. "aanvoerder" (`is_captain`) als los, puur informatief label onafhankelijk van admin-rechten
- Admin: spelers toevoegen, PIN resetten, rol wijzigen, aanvoerder aan/uit, "inloggen als speler"
  (mint sessie zonder PIN nodig te hebben)
- Club/team-picker met auto-skip bij één keuze
- Wedstrijden, beschikbaarheid, uitroostering/opstelling (drag & drop), fluitbeurten, announcements
- Goals/assists invoer incl. strafcorner + strafbal onderscheid
- Statistieken-pagina: totaaloverzicht (totaal doelpunten + uit corner), Topscorer- en MVP-podium,
  sorteerbare/uitklapbare spelerslijst met Gesp./VD/SC/SB/Goals/Ass. kolommen
- Dashboard toont dezelfde Topscorer/MVP podiums (compacte variant), met link naar volledige Stats
- Vercel deploy + CI (GitHub Actions, Playwright)

### Bekende openstaande punten
- [ ] Competitie/poule-stand (league table) nog niet gebouwd
- [ ] Echte spelers/team nog toe te voegen zodra seizoen start (medio augustus 2026)
- [ ] PWA icons/manifest polish

---

## Auth & RBAC architectuur (kern)
- Elke speler krijgt een "schaduw" Supabase Auth account (`{uuid}@team.internal` + willekeurig
  wachtwoord, opgeslagen in `player_credentials`); login gebeurt via een 4-6 cijferige PIN
  (bcrypt-hash in `player_credentials.pin_hash`, nooit plaintext, nooit herstelbaar)
- Alle auth-mutaties lopen via de edge function **`auth-handler`**
  (`supabase/functions/auth-handler/index.ts`): create_player, get_players_for_login, login,
  set_pin, reset_pin, change_pin, change_role, impersonate, set_captain, get_players_status
- RBAC hiërarchie: `platform_admin` > `club_admin` (`club_memberships.role`) >
  `team_admin` (`team_memberships.role`) > `player`, plus onafhankelijk `is_captain` boolean
- DB trigger `prevent_unauthorized_role_change` voorkomt dat een team_admin zichzelf via directe
  REST-calls promoveert (RLS alleen kan dat niet afdwingen op kolomniveau)
- Frontend haalt altijd een verse access token op (`getFreshAccessToken()` in `src/lib/auth.ts`)
  vóór elke admin-actie, om "niet geauthenticeerd" door verlopen tokens op achtergrond-tabs te voorkomen

## Statistieken-logica
- Gedeelde hook `useTeamStats()` in `src/lib/stats.ts` (gebruikt door zowel Dashboard als Stats
  pagina, één cache) berekent per speler: `matches_played`, `fieldGoals` (VD), `cornerGoals` (SC),
  `penaltyGoals` (SB), `goals` (= som van de drie), `assists`
  - VD = doelpunt, strafcorner/strafbal niet aangevinkt bij uitslag
  - SC = doelpunt + strafcorner aangevinkt
  - SB = doelpunt + strafbal aangevinkt
- `topByGoals()` / `topByGoalsPlusAssists()` leveren top-3 voor de podiums
- `StatsPodiums` component (`src/components/ui/MiniPodium.tsx`) toont Topscorer + MVP podium
  compact in één kaart

---

## Supabase Setup
- **Project:** Team_APP_Pilot
- **URL:** https://fwsjcjyovqikxrzcbovw.supabase.co
- **Schema:** `supabase/schema.sql` + migraties in `supabase/migrations/`

## Pilot Data (HC Leiden — Heren 30-1)
- Club: "HC Leiden", Hofbrouckerlaan 51a, 2341 LM Oegstgeest
- Team: "Heren 30-1", seizoen 2025-2026 (enige actieve club/team; test-fixtures verwijderd)
- Rogier: platform_admin

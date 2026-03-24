# Hockey Team App — Project Status

## Overzicht
PWA voor HC Leiden Heren 30-1. Multi-tenant architectuur (club → team). Pilot project.
Gebaseerd op: `HOCKEY_TEAM_APP_PLAN_v3.md`

---

## Tech Stack
| Laag | Keuze |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Routing | React Router v7 |
| State | Zustand |
| Database + Auth | Supabase (Project: Team_APP_Pilot) |
| Hosting | Vercel (nog te koppelen) |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| Charts | Recharts |
| Reistijd | OpenRouteService API |

---

## Implementatie Voortgang

### ✅ Stap 1: Foundation (DONE)
- Vite + React 19 + Tailwind v4 + PWA plugin
- Supabase client + .env geconfigureerd
- CSS theming systeem (CSS custom properties, club-kleuren)
- `lib/supabase.js` `lib/auth.js` `lib/travel.js` `lib/gathering.js` `lib/utils.js` `lib/theme.js`
- Zustand stores: `useAuthStore` `useTeamStore`
- Layout: AppShell, BottomNav, GatheringBanner, ProtectedRoute, AdminRoute
- Alle routing (App.jsx)
- Dashboard pagina (volledig functioneel)
- Login pagina (volledig functioneel met email-check flow)
- Alle overige pagina's als werkende stubs
- `supabase/schema.sql` — 15 tabellen, 2 views, RLS policies, auto-profiel trigger

### 🔲 Stap 2: Auth & User Management
- Admin: spelers uitnodigen (naam + email)
- Rollenbeheer (team_admin / player)
- Profiel/instellingen pagina

### 🔲 Stap 3: Competitie / Poule Systeem
- League setup (teams toevoegen + geocoding)
- Wedstrijden aanmaken via dropdowns
- NTB (nog niet bekend) support

### 🔲 Stap 4: Wedstrijden & Seizoenskalender
- Wedstrijdoverzicht pagina
- Wedstrijd detail pagina
- GatheringBanner actief met echte data
- Admin: wedstrijd formulier

### 🔲 Stap 5: Beschikbaarheid
- AvailabilityButtons (✓/✗/?)
- AvailabilityGrid (admin matrix view)
- Nudge indicator

### 🔲 Stap 6: Uitroostering & Opstelling
- RosterManager + FairnessMeter
- HockeyField SVG + PlayerMagnet drag-and-drop (@dnd-kit)

### 🔲 Stap 7: Goals, Assists & Stats + Stand
- GoalForm, LeagueResultInput
- LeagueTable (automatische stand)
- Stats pagina (topscorers, charts)

### 🔲 Stap 8: Fluitbeurten & Berichten
- Umpire duties CRUD
- Announcements / weekberichten
- WhatsApp share button

### 🔲 Stap 9: Polish & Deploy
- PWA icons + manifest
- Vercel deploy
- Performance optimalisatie

---

## Supabase Setup
- **Project:** Team_APP_Pilot
- **URL:** https://fwsjcjyovqikxrzcbovw.supabase.co
- **Schema:** `supabase/schema.sql` — nog te draaien in SQL Editor!

## Pilot Data (HC Leiden — Heren 30-1)
- Club: "HC Leiden", Hofbrouckerlaan 51a, 2341 LM Oegstgeest
- Team: "Heren 30-1", seizoen 2025-2026
- Rogier: team_admin + is_platform_admin = true
- Squad size: 16 | Gathering lead: 30 min | Travel buffer: 10 min

---

## Openstaande acties
- [ ] Schema draaien in Supabase SQL Editor
- [ ] Club + team aanmaken in Supabase (handmatig of via seed script)
- [ ] Rogier account aanmaken + is_platform_admin instellen
- [ ] Vercel project koppelen

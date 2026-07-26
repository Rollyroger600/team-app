# CLAUDE.md

Guidance for Claude Code when working in this repository. See [PROJECT_STATUS.md](PROJECT_STATUS.md)
for feature progress and pilot data.

## What this is
Hockey team management PWA for HC Leiden Heren 30-1 (React 19 + Vite + TS + Zustand +
React Router v7 + TanStack Query + Tailwind v4 + Supabase). Deployed via GitHub → Vercel
(auto-deploy on push to `main`). Pre-season pilot — no real users yet besides the admin (Rogier),
new season starts mid-August 2026. Installed by players as a homescreen PWA on their phones.

## Stack quick reference
- Supabase project ref: `fwsjcjyovqikxrzcbovw` (name `Team_APP_Pilot`) — use the Supabase MCP
  tools for migrations/SQL/edge function deploys, or `supabase functions deploy <name>
  --project-ref fwsjcjyovqikxrzcbovw` via CLI if MCP deploy fails.
- Vercel project: `team-app` (team `rollyrogers-projects`), production domain
  `team-app-zeta.vercel.app`.
- `npx tsc --noEmit` after any TS change — should be fully clean. If it isn't, the error is real
  (two previously-"known" pre-existing errors — a lucide `title` prop and a `SelectQueryError` in
  MatchDetail — turned out to be genuine bugs and were fixed 2026-07-27; don't wave away new
  errors as "probably pre-existing" without checking).

## Auth & RBAC architecture
- Login is PIN-based, not email/password. Every player has a "shadow" Supabase Auth account
  (`{uuid}@team.internal` + random 32-char password in `player_credentials.internal_email` /
  `internal_password`), gated by a bcrypt-hashed PIN (`player_credentials.pin_hash`). PINs are
  never recoverable by design — only resettable by an admin.
- All auth mutations go through the single edge function
  `supabase/functions/auth-handler/index.ts`. Do not add direct client-side writes to
  `player_credentials` or auth-adjacent tables — add an action to this function instead.
- RBAC hierarchy: `platform_admin` (Rogier — sole overall app admin) > `team_admin`
  (`team_memberships.role`, labeled "Beheerder" in the UI) > `player`. `is_captain` on
  `team_memberships` is a separate, purely informational flag — it grants no permissions. Don't
  conflate captain status with admin status in UI or checks.
- The `club_admin` tier (`club_memberships.role`) is intentionally collapsed into
  `platform_admin` (since 2026-07-25) — this app manages a single team, so a club-scoped admin
  role added no real distinction. Rather than ripping it out of every RLS policy and call site,
  the primitives were redefined in place: SQL `is_club_admin_for_team()` now just calls
  `is_platform_admin()`, the edge function's `isClubAdminForTeam()` does the same, and client
  `useAuthStore.isClubAdmin()` is a thin wrapper over `isPlatformAdmin()`. `club_memberships` the
  table still exists (harmless, shown on `/debug`) but no longer grants anything — don't
  reintroduce a real club_admin check without deliberately deciding to un-collapse it.
- There is no longer a separate "Beheerders" admin page — role changes (making/unmaking someone
  a "Beheerder") happen from Admin → Spelers → player's ⋮ menu, gated by the same `changeRole`
  edge-function action (platform_admin only).
- `isAdminForTeam` in the edge function checks team_admin OR falls through to
  `isClubAdminForTeam` (→ platform_admin). Keep that fallthrough intact in any refactor.
- A DB trigger (`prevent_unauthorized_role_change`) blocks direct REST updates to
  `team_memberships.role` from anyone but the service role or platform_admin — RLS alone can't
  enforce this at the column level. Its service-role bypass must use `auth.role() = 'service_role'`
  — the legacy GUC `request.jwt.claim.role` is **not** set by this PostgREST version and would
  silently reject every legitimate edge-function role change if reverted (fixed 2026-07-25).

## Known gotchas (don't reintroduce)
- **Supabase-js auth deadlock**: never `await` a Supabase call directly inside
  `onAuthStateChange` — it re-enters the client's internal lock held during `setSession()` and
  silently freezes every future call (no errors, no network activity). Defer via
  `setTimeout(fn, 0)` if you need to react to an auth state change.
- **Stale access tokens**: admin actions must fetch a fresh token via `getFreshAccessToken()`
  (`src/lib/auth.ts`) before calling the edge function, not a cached `session.access_token` —
  background/inactive tabs throttle supabase-js's own auto-refresh `setTimeout` and cause
  spurious "niet geauthenticeerd" errors otherwise.
- **`team_memberships.joined_at`** is the real column name — there is no `created_at`. An
  `.order('created_at')` silently returns an empty list rather than erroring.
- **`match_availability` has two FKs to `profiles`** (`player_id` and `set_by`, the latter added
  for admin-edited availability). An unqualified `.select('..., profiles(...)')` embed is
  ambiguous and makes PostgREST reject the *entire* query — this silently zeroed every
  availability count/list app-wide until fixed (2026-07-27). Don't add a bare `profiles(...)`
  embed on this table; either omit it and join names via `team_memberships` client-side (the
  established pattern — see `TeamAvailabilityList.tsx`, `Dashboard.tsx`, `MatchDetail.tsx`), or
  use an explicit `profiles!match_availability_player_id_fkey(...)` hint if you truly need it.

## Stats logic
- Shared hook `useTeamStats()` in `src/lib/stats.ts` is the single source of truth for
  Dashboard and Stats page stats (same query key/cache) — don't duplicate the aggregation query
  elsewhere.
- Goal categorization is exact, keep it that way if extending:
  - **VD** (velddoelpunt): scored, `is_penalty` and `is_penalty_corner` both false
  - **SC** (strafcorner): scored + `is_penalty_corner` true
  - **SB** (strafbal): scored + `is_penalty` true
  - **Goals** = VD + SC + SB
- `topByGoals()` / `topByGoalsPlusAssists()` produce the top-3 podium entries. `PodiumCard`
  (`src/components/ui/MiniPodium.tsx`) is the generic building block — takes a `sections` array
  of `{ title, statLabel, entries }`; `StatsPodiums` is a thin wrapper around it for the
  Topscorer/MVP pair. Potjescup's podium (`topByPoints()` in `src/lib/potjescup.ts`) reuses
  `PodiumCard` directly with a single section — reuse this pattern for any future leaderboard
  rather than building a new podium component.

## Potjescup (training scrimmage points)
- Tables `potjescup_sessions` (one per training date) and `potjescup_scores` (one row per active
  player per session, 0/0.5/1 points — 0.5 covers a player who switched sides mid-scrimmage).
  Admin CRUD in `src/pages/admin/AdminPotjescup.tsx`; creating a session bulk-inserts a score row
  for every currently-active player so nobody has to be added manually.
- `usePotjescupStats()` in `src/lib/potjescup.ts` derives the full ranking from
  `team_memberships` (active players) left-joined against scores — every active player appears
  from day one at 0 points, not just once they've played a session.
- Rules text shown via the info ("i") icon on `/potjescup` is hardcoded in `Potjescup.tsx`
  (`RulesModal`) — update it there if the rules change, it's not stored in the DB.

## Availability & attendance
- `match_availability` covers the **whole season**, not just upcoming matches — both
  `src/pages/More.tsx` (Beschikbaarheid tab, split into upcoming + "Al geweest") and
  `src/pages/admin/AdminAttendance.tsx` (the full player × match matrix) intentionally query
  without a `.gte(match_date, today)` filter. Don't reintroduce that filter; the whole point is
  that history stays visible and correctable.
- Admins can set/correct *any* player's availability (not just their own) via
  `src/components/ui/TeamAvailabilityList.tsx`, used on the Dashboard, `More.tsx`, and (read-only
  count) `MatchDetail.tsx`. Admin-set rows are flagged `overridden: true` + `set_by: <admin id>`
  so the player can see it was set on their behalf. Gated client-side by
  `isAnyTeamAdmin()/isPlatformAdmin()`, not separately checked against match date — editing past
  matches is intentional (see above).
- **Realtime**: `match_availability` is in the `supabase_realtime` publication, and
  `useRealtimeInvalidate(table, queryKey, enabled)` in `src/lib/realtime.ts` subscribes to
  `postgres_changes` and invalidates the given React Query key on any insert/update/delete. Wired
  into Dashboard, MatchDetail, More.tsx, and AdminAttendance so those screens update live when
  another player submits availability from their phone — no manual refresh needed (important
  since this is used as a homescreen PWA). If you add a new screen that reads `match_availability`,
  wire this hook in too rather than relying on `staleTime`/refetch-on-focus. The hook is generic
  (table + queryKey) — reuse it for any other table that needs the same live-refresh behavior.
- `buildShareText()` in `src/lib/utils.ts` generates the WhatsApp "Delen" message on
  `MatchDetail.tsx` — reproduces the exact weekly-update format the captain sends (day/date,
  opponent, times, then available/unavailable/unknown-or-maybe names + totals). If the wording
  needs to change, it's a plain template string there, not a database value.

## League teams (competitie)
- `league_teams.short_name` (nullable) lets admins give a long registry-imported opponent name
  (e.g. "Klein Zwitserland (H.C.) Heren 30-1") a short display name, editable inline in
  Admin → Competitie. Always render league team names through `leagueTeamDisplayName()` in
  `src/lib/utils.ts` (falls back to `team_name`), never `.team_name` directly — it's wired into
  the standings widget, match cards, and the team dropdowns in Comp. wedstrijden/Uitslagen
  invoeren. This does **not** affect `matches.opponent` (a separate free-text snapshot used for
  the team's own match list/Dashboard/share text) — that's a deliberate, un-synced denormalization
  from when the match was created/imported.

## Umpire duties (fluitbeurten)
- Two kinds of duty rows in `umpire_duties`: match-linked (via `match_id`, auto-generated 2 per
  home match by "Genereer fluitbeurten") and standalone/"losse" ones (`match_id` null,
  `duty_date` + `umpire_match_desc` set directly, added via the "Losse fluitbeurt toevoegen" form
  in `AdminUmpire.tsx` — e.g. a cup match not in the regular schedule).
- `groupDuties()` in `src/components/ui/UmpireCard.tsx` is the single grouping/sorting
  implementation shared by `AdminUmpire.tsx`, `More.tsx`, and `Dashboard.tsx`'s "next duty" —
  don't reimplement match/date grouping separately. Standalone duties group by
  `duty_date + umpire_match_desc` (no shared batch id column exists, so two unrelated manual
  entries with identical date+description would incorrectly merge — acceptable edge case for
  this pilot's scale).

## Testing pattern for verifying admin/player features as a real user
To test as an actual player without ever touching, guessing, or resetting their real PIN: mint a
session directly via their `player_credentials.internal_email` / `internal_password` (curl to
`/auth/v1/token?grant_type=password`), then inject it in the browser with
`supabase.auth.setSession()`. Always delete any temp file holding the token/password afterward,
and clean up any test rows you inserted directly via SQL once done verifying.

## Conventions
- UI copy is Dutch. Match existing terminology exactly (e.g. "Beheerder" not "Admin",
  "Aanvoerder" for captain, "Gesp./VD/SC/SB/Goals/Ass." for stats columns, "Al geweest" for past
  matches) — these labels were deliberately chosen by the user, don't retranslate or rephrase them.
- `.claude/settings.local.json` and `supabase/.temp/cli-latest` are local tooling artifacts —
  never commit them.
- Prefer running dev servers via the Browser pane's `preview_start`, not a second `vite`
  instance in Bash — running both caused flakiness with Playwright's own `webServer` before.
- When a bug report says a button/feature "doesn't work" but the code looks correct, actually
  reproduce it live (direct API call + a real click in the browser) before assuming and fixing a
  guessed root cause — twice this session a reported bug turned out to already work, and twice
  a reported-fine feature turned out to hide a real bug (see `match_availability` gotcha above).

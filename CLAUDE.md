# CLAUDE.md

Guidance for Claude Code when working in this repository. See [PROJECT_STATUS.md](PROJECT_STATUS.md)
for feature progress and pilot data.

## What this is
Hockey team management PWA for LOHC Heren 30-1 (React 19 + Vite + TS + Zustand +
React Router v7 + TanStack Query + Tailwind v4 + Supabase). Deployed via GitHub → Vercel
(auto-deploy on push to `main`). Installed by players as a homescreen PWA on their phones.

**Live in production since the 2026-2027 season started (mid-August 2026).** This is no longer a
pre-season pilot: as of 2026-08-20, 19 of the 22 players have signed in at least once and 15 did
so in the past week. Weigh changes accordingly — in particular **anything touching the login flow
now risks locking out real people mid-season**, so login changes need a fallback path and a
deliberate moment to hand out whatever replaces the old route.

**Season reset (2026-08-13)**: all pilot data from 2025-2026 was wiped so the 2026-2027 season
could be entered from scratch — competition, matches, goals, availability, umpire duties,
announcements and Potjescup are empty; the 22 players (profiles, memberships, roles, PIN
credentials) and the 289-club `clubs_registry` were left untouched, and `teams.season` is now
`2026-2027`. The pre-wipe snapshot lives in the **`backup_2526` schema** (not `public`, so
PostgREST never exposes it). Drop it once the new season is running: `DROP SCHEMA backup_2526
CASCADE;`.

## Stack quick reference
- Supabase project ref: `fwsjcjyovqikxrzcbovw` (name `Team_APP_Pilot`) — use the Supabase MCP
  tools for migrations/SQL/edge function deploys, or `supabase functions deploy <name>
  --project-ref fwsjcjyovqikxrzcbovw` via CLI if MCP deploy fails.
- Vercel project: `team-app` (team `rollyrogers-projects`), production domain
  `hockeyteam.app` (het oude `team-app-zeta.vercel.app` blijft als alias werken).
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
- RBAC hierarchy: `platform_admin` (Rogier — sole overall app admin, a flat boolean on
  `profiles`) > `team_owner` ("Hoofdbeheerder") > `team_admin` ("Beheerder") > `player`. The
  last three live in `team_memberships.role`, which is plain TEXT with **no CHECK constraint** —
  adding a role costs no schema change. `is_captain` on `team_memberships` is a separate, purely
  informational flag — it grants no permissions. Don't conflate captain status with admin status.
- **`team_owner` is swallowed by every admin check**, deliberately: SQL `is_team_admin()` matches
  `role IN ('team_admin','team_owner')`, and so do the edge function's `isAdminForTeam()` and
  client `isTeamAdmin()`. That way no RLS policy or call site needs to enumerate both. A
  Hoofdbeheerder additionally passes `is_team_owner()`, which gates Admin → Team-instellingen and
  the whole `teams` table (see the settings trigger below). Migration `20260814` promoted every
  existing `team_admin` to `team_owner`, so **omitting `'team_owner'` from an admin check silently
  locks out real users** — that exact bug sat in `isAdminForTeam()` until 2026-08-20.
- **Permission checks in the client must be team-scoped.** Use `useIsTeamAdmin()` /
  `useIsTeamOwner()` from `src/lib/permissions.ts`, which bind to `useTeamStore.activeTeam`. The
  old `isAnyTeamAdmin()` looked at *all* memberships at once and was removed — with one team it
  gave the same answer, but with two it hands an admin of team B the admin UI while they're
  looking at team A, and RLS then rejects the write with a raw Postgres error.
- The `club_admin` tier (`club_memberships.role`) is intentionally collapsed into
  `platform_admin` (since 2026-07-25) — this app manages a single team, so a club-scoped admin
  role added no real distinction. Rather than ripping it out of every RLS policy and call site,
  the primitives were redefined in place: SQL `is_club_admin_for_team()` now just calls
  `is_platform_admin()`, the edge function's `isClubAdminForTeam()` does the same, and client
  `useAuthStore.isClubAdmin()` is a thin wrapper over `isPlatformAdmin()`. `club_memberships` the
  table still exists (harmless, shown on `/debug`) but no longer grants anything — don't
  reintroduce a real club_admin check without deliberately deciding to un-collapse it.
- There is no longer a separate "Beheerders" admin page — role changes (making/unmaking someone
  a "Beheerder" or "Hoofdbeheerder") happen from Admin → Spelers → player's ⋮ menu via the
  `changeRole` edge-function action. **Not platform_admin-only since 2026-08-16**: a `team_owner`
  may assign any role *within their own team*, including making someone else a Hoofdbeheerder.
  `platform_admin`'s remaining exclusivity is that it works across all teams. There is
  deliberately no "last owner can't demote themselves" guard — platform_admin can always repair it.
- `isAdminForTeam` in the edge function checks team_admin/team_owner OR falls through to
  `isClubAdminForTeam` (→ platform_admin). Keep both the `team_owner` arm and that fallthrough
  intact in any refactor.
- A DB trigger (`prevent_unauthorized_role_change`) blocks direct REST updates to
  `team_memberships.role` from anyone but the service role or platform_admin — RLS alone can't
  enforce this at the column level. Its service-role bypass must use `auth.role() = 'service_role'`
  — the legacy GUC `request.jwt.claim.role` is **not** set by this PostgREST version and would
  silently reject every legitimate edge-function role change if reverted (fixed 2026-07-25).

## Per-team settings & feature toggles
- Settings live as **columns on `teams`**, not in a separate table — same precedent as
  `gathering_lead_time`. `TeamSettings` in `src/types/app.ts` is a hand-written mirror of that
  subset; `src/stores/useTeamStore.ts` projects a `teams` row onto it with `?? default` per field.
  Adding a setting means editing **both** places in useTeamStore (the initial state *and*
  `setActiveTeam`) plus the `TeamSettings` type.
- `BooleanSettingKey` (also `types/app.ts`) is a mapped type resolving to just the `*_enabled`
  keys. Any new `boolean` on `TeamSettings` automatically becomes usable as a `flag` — that's the
  whole point. Three consumers share it: `BottomNav.tsx` (`navItems[].flag`),
  `FeatureRoute.tsx` (route guard), and `More.tsx`'s tab array. Gate the *query* too
  (`enabled: ... && teamSettings.x_enabled`), not just the render.
- **`FeatureRoute` waits for `settingsLoaded`.** `teamSettings` defaults to everything-on so the
  app can render before a team loads; without that guard a disabled page flashes for one frame
  before redirecting. Same role as `profileLoaded` in `AdminRoute`.
- **The `enforce_team_owner_only_settings` trigger fails CLOSED** (since 2026-08-20). It compares
  the whole row as `jsonb`, so *every* column on `teams` — including ones added later — is
  Hoofdbeheerder-only automatically. The old version was a hand-maintained per-column
  `IS DISTINCT FROM` chain that failed *open*: a forgotten column was silently writable by a plain
  Beheerder (`season` actually was). To let a plain Beheerder write a column, add it explicitly to
  `v_admin_writable` inside the function.
- **Consequence for migrations**: a migration connection has no `auth.uid()` and no
  `service_role`, so a data `UPDATE` on `teams` from a migration is rejected. DDL is unaffected
  (`ADD COLUMN` doesn't fire a row trigger). For a real UPDATE, wrap it in
  `ALTER TABLE teams DISABLE/ENABLE TRIGGER enforce_team_owner_only_settings` — same pattern
  `20260814_team_owner_role.sql` uses for the role trigger. See
  `20260820_backfill_club_team_slugs.sql`.

## What the anon key can reach
The anon key ships inside the frontend bundle, so it is public — treat "anon can read it" as
"the internet can read it". Verify with a bare `curl -H "apikey: <anon>"`, not by reasoning
about policies.

- **Views need `security_invoker`, and it is not the default.** Without it a view runs with its
  owner's rights and bypasses RLS entirely — the policies on the underlying tables simply do not
  apply. `v_player_stats` and `v_league_standings` were created without it, so one anonymous GET
  returned every player's name, goals, assists and attendance history across all teams. Fixed
  2026-08-20 (`20260820_lock_down_public_reads.sql`). **Any new view must set it explicitly.**
- `SECURITY DEFINER` functions default to `EXECUTE` for PUBLIC. `get_team_players_for_login`
  handed out any team's full roster to anyone with a `team_id`; its only real caller is the edge
  function, which uses the service role. Revoke from `PUBLIC, anon, authenticated` and let
  `service_role` keep it.
- **Still open, deliberately**: `clubs` and `teams` are `USING (true)` — one club name and one
  team name. They stay readable until the personal-access-code login (1c) replaces the club/team
  picker in `Login.tsx`, which is the only thing that needs them unauthenticated. Every other
  table was probed on 2026-08-20 and returns zero rows to anon.
- `clubs_registry` INSERT is open to any authenticated user of any tenant — a pollution vector,
  not a data leak. Not yet addressed.

## Known gotchas (don't reintroduce)
- **Every UPDATE policy needs `WITH CHECK`, not just `USING`.** `USING` says which rows you may
  touch; `WITH CHECK` says what the row may look like afterwards. All 18 lacked it until
  2026-08-20, which let a player rewrite their own availability row into someone else's name
  (`USING` passes — at that moment it *is* their row) and let an admin move a row to another
  team. New tables must set both, with the same expression.
- **`memberships[0]` is not a stable choice.** `useAuthStore` now filters `.eq('active', true)`
  and orders by `joined_at`, and `resolveActiveMembership()` in `src/lib/activeTeam.ts` layers the
  remembered `localStorage.activeTeamId` on top. Don't index into `memberships` directly —
  without an ORDER BY, Postgres returns physical row order, which shifts after any UPDATE.
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
- Rules text shown via the info ("i") icon on `/potjescup` is stored per team in
  `teams.potjescup_rules_text` and edited in **Admin → Team instellingen** (not in
  Admin → Potjescup, which is session/points CRUD only). `DEFAULT_POTJESCUP_RULES` in
  `src/lib/potjescup.ts` is the fallback when the column is NULL. Paragraphs are split on a blank
  line.
- `usePotjescupHistory()` (also in `src/lib/potjescup.ts`) feeds the "Historie" log and the
  "Verloop" chart on `/potjescup`: sessions newest-first, plus a cumulative per-player series
  built over *every* session so a player who scored nothing still gets a flat segment rather
  than a gap. Any mutation in `AdminPotjescup.tsx` must invalidate `['potjescupHistory', teamId]`
  alongside the other two keys.
- `PotjescupChart` (`src/components/ui/PotjescupChart.tsx`) is **lazy-loaded** from
  `Potjescup.tsx` — recharts is ~100 kB gzip, which is why `MIN_SESSIONS_FOR_CHART` lives in
  `potjescup.ts` and not in the chart module: importing it eagerly would defeat the split.
  The `<Line>`s set `isAnimationActive={false}` deliberately — recharts' draw-on animation
  restarts on every parent re-render, and on a page that re-renders often the lines stayed
  stuck at ~2px of `stroke-dasharray` and the chart looked empty.
- Chart series use `--color-chart-1..5` (added 2026-08-13, one set per theme). They are app
  tokens, not brand ones, and must stay disjoint from the status colours — a line means "this
  player", not "beschikbaar". A player's own line uses `--color-text` rather than a sixth hue,
  so it never collides with the five.

## Availability statuses
- Four values on `match_availability.status`, pinned by a CHECK constraint:
  `available`, `unavailable`, `injured` ("Geblesseerd" — this replaced the old `maybe`/"Misschien"
  in 2026-07-28) and `rostered_off` ("Uitgeroosterd").
- **`src/lib/availability.ts` is the single source of truth** for label, icon, colours and the
  matrix marker. It used to be redefined in six places, which made adding a status a six-way edit —
  render every status through `STATUSES` / `PLAYER_STATUSES` / `statusDef()` instead of writing a
  local `{status, icon, label}` array. `PLAYER_STATUSES` is the three a player may set for
  themselves; `STATUSES` (all four) is only for the admin picker in `TeamAvailabilityList.tsx`.
- **`rostered_off` is admin-only, and the UI is not what enforces it.** The RLS policies let a
  player write to their own row, so hiding the button proves nothing — a REST call would still
  land it. The `enforce_admin_only_rostered_off` trigger rejects it for anyone who isn't a
  team_admin, platform_admin or the service role. Same reasoning as
  `prevent_unauthorized_role_change`; keep both halves if you touch this.
- A player set to `rostered_off` no longer counts as available — the status *replaces* their own
  answer rather than layering on top. That was a deliberate call; if fairness tracking ("who has
  been rostered off most") is ever wanted, it needs a separate column instead.
- Statuses must never use the brand colour: `injured` uses `--color-maybe` and `rostered_off` uses
  `--color-rostered-off`, so they stay distinguishable from buttons and navigation in all three
  themes (the old `maybe` used `--color-secondary`, which in the light theme was indistinguishable
  from bordeaux chrome).

## Availability & attendance
- `match_availability` covers the **whole season**, not just upcoming matches — both
  `src/pages/More.tsx` (Beschikbaarheid tab, split into upcoming + "Al geweest") and
  `src/pages/admin/AdminAttendance.tsx` (the full player × match matrix) intentionally query
  without a `.gte(match_date, today)` filter. Don't reintroduce that filter; the whole point is
  that history stays visible and correctable.
- Admins can set/correct *any* player's availability (not just their own) via
  `src/components/ui/TeamAvailabilityList.tsx`, used on the Dashboard, `More.tsx`, and (read-only
  count) `MatchDetail.tsx`. Admin-set rows are flagged `overridden: true` + `set_by: <admin id>`
  so the player can see it was set on their behalf. Gated client-side by `useIsTeamAdmin()`
  (`src/lib/permissions.ts`), not separately checked against match date — editing past matches is
  intentional (see above).
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
- Because of that split, `matches.opponent` needs its own resolver: **`useOpponentName()` in
  `src/lib/opponents.ts`**. It loads the league's `league_teams` once (cached under
  `['opponentShortNames', teamId]`) and maps an opponent string onto the admin's short name.
  Render every `match.opponent` through it — Dashboard, Wedstrijden, MatchDetail, Stats, More,
  Opstelling, the umpire cards and the admin screens all do. Two fallbacks are deliberate: a match
  with no league counterpart (friendly, cup game) keeps its own text, and a league team with no
  `short_name` yet gets its " Heren 30-1" suffix trimmed so it still fits on a phone.
  `buildShareText()` takes the resolved name as its 4th argument — the WhatsApp message uses short
  names too.
- **"2e helft genereren"** (`AdminLeagueMatches.tsx`) derives the half-length from the number of
  league teams (`T-1` for even T, `T` for odd), **not** from how many matchdays happen to exist.
  Round R always mirrors to `R + halfLen`, and the delete is `.gt('matchday', halfLen)`. That makes
  it idempotent: clicking ten times equals clicking once, and it repairs an earlier double-click.
  The pre-2026-08-13 version took *all* existing rounds as "the first half", so a second click
  turned 22 rounds into 44 and quadrupled the fixtures — don't reintroduce a length derived from
  `filledMatchdays.length`.
- **"Genereer mijn wedstrijden"** (same screen) creates the team's own `matches` rows from
  `league_matches`. It exists because `AdminMatchEdit.tsx` never sets `league_match_id`, and
  without that link "Reistijden berekenen" (`AdminLeague.tsx` filters `.not('league_match_id','is',
  null)`) and the poule→wedstrijddetail link in `Matches.tsx` both silently stop working.
  Three things it must keep doing: write the **full** `league_teams.team_name` into
  `matches.opponent` (that's the key `useOpponentName()` maps on, not `short_name`); skip fixtures
  without a date (`matches.match_date` is NOT NULL), so it can be re-run once the 2nd-half dates
  are filled in; and dedupe on `league_match_id` **or** `match_date + opponent`. That second route
  is what re-links own matches after the 2nd half is regenerated — `matches.league_match_id` is
  `ON DELETE SET NULL`, so regenerating orphans them, and matching on date+opponent restores the
  link instead of inserting a duplicate. A partial unique index
  (`matches_league_match_id_key`, `WHERE league_match_id IS NOT NULL`) is the backstop; a 23505
  from a concurrent double-click is swallowed on purpose.

## Umpire duties (fluitbeurten)
- Two kinds of duty rows in `umpire_duties`: match-linked (via `match_id`, auto-generated 2 per
  home match by "Genereer fluitbeurten") and standalone/"losse" ones (`match_id` null,
  `duty_date` + `umpire_match_desc` set directly, added via the "Losse fluitbeurt toevoegen" form
  in `AdminUmpire.tsx` — e.g. a cup match not in the regular schedule).
- Admins delete duties from `AdminUmpire.tsx` at two levels: the trash icon in a group header
  removes the whole duty (both slots in one `.in('id', ids)` call), the one per row removes a
  single slot. Both confirm first — deleting is irreversible and the rows carry player
  assignments. Announcements have the same pattern in `src/pages/Announcements.tsx` (admin-only
  trash icon per bericht); its mutation must also invalidate `['nextMatch', teamId]`, because the
  Dashboard's "Laatste bericht" card is fetched inside that query rather than `['announcements']`.
- `groupDuties()` in `src/components/ui/UmpireCard.tsx` is the single grouping/sorting
  implementation shared by `AdminUmpire.tsx`, `More.tsx`, and `Dashboard.tsx`'s "next duty" —
  don't reimplement match/date grouping separately. Standalone duties group by
  `duty_date + umpire_match_desc` (no shared batch id column exists, so two unrelated manual
  entries with identical date+description would incorrectly merge — acceptable edge case for
  this pilot's scale).

## Theming (clubkleuren)
- Three palettes in the LOHC club colours, each a `:root[data-theme="..."]` block in
  `src/index.css`: **clubshirt** (light, the default), **clubhuis** (dark), **bordeaux**. The
  player picks one in Instellingen → Weergave.
- **Never hardcode a colour.** Every colour goes through a `--color-*` token (`bg-surface`,
  `text-text-muted`, `border-border`, `text-danger`, …). A `text-slate-400`-style class only looks
  right in one theme and silently breaks the other two — 433 of them were migrated out for exactly
  this reason. For inline `style` props that need opacity, use `tint('--color-x', 20)` from
  `src/lib/utils.ts` rather than an `rgba()` literal.
- Token roles that are easy to get wrong: `--color-secondary` is the **fill** (solid buttons,
  active pills) and `--color-secondary-soft` is the **accent text/icon** colour — use the soft one
  for text, it's the one tuned for contrast. Anything on `bg-primary` must also set
  `text-primary-text`, because `--color-primary` is dark bordeaux in all three themes while the
  page text colour flips per theme.
- The choice lives in `localStorage` (key `theme`), not the database, so it can be applied before
  the first paint. An inline script in `index.html` does that — if you change `STORAGE_KEY`,
  `DEFAULT_THEME` or the theme names in `src/lib/theme.ts`, update that script too.
- `applyClubTheme()` was **removed** (2026-07-27). It pushed `clubs_registry.primary_color` /
  `secondary_color` onto `documentElement` as inline styles, which beat the attribute selectors and
  would override whatever the player picked. The DB columns still exist but no longer do anything —
  don't wire them back up without deliberately redesigning the precedence.
- The hockey pitch in `MatchLineup.tsx` (green gradient + position colours) is intentionally
  theme-independent — a pitch is green regardless.
- Each theme block is grouped into **brand** tokens (the six `primary*`/`secondary*` ones) and
  everything else. That split is deliberate: if the app ever serves multiple clubs, only the brand
  six would come from a club record while the rest stays the app's. Keep new tokens on the right
  side of that line — in particular the status colours (`available`, `unavailable`, `maybe`,
  `danger`, `success`, …) must never become club-configurable, since green has to keep meaning
  "beschikbaar" everywhere.
- After touching any colour, re-run the contrast check: everything should stay ≥4.5:1 against its
  surface in all three themes, except `--color-text-faint` (~3.5, decorative parentheticals only).

## Testing pattern for verifying admin/player features as a real user
To test as an actual player without ever touching, guessing, or resetting their real PIN: mint a
session directly via their `player_credentials.internal_email` / `internal_password` (curl to
`/auth/v1/token?grant_type=password`), then inject it in the browser with
`supabase.auth.setSession()`. Always delete any temp file holding the token/password afterward,
and clean up any test rows you inserted directly via SQL once done verifying.

**The Playwright suite was removed on 2026-08-24** (it lived in `tests/`, with
`playwright.config.ts` and `.env.test`). It drove the real login against `qa-club`/`qa-team` slug
fixtures that no longer exist — only LOHC/Heren 30-1 remain — so every spec failed in `auth.setup`
before reaching an assertion. It could not be revived in place: re-seeding QA fixtures into the
live project makes a **club picker appear at login for all 22 real players** (`Login.tsx` only
auto-skips that step when there is exactly one club), and QA players would show up in the real
name picker. Doing it properly needs a second Supabase project. Don't re-add browser e2e against
the production database.

**What replaced it: `npm test` (vitest), unit tests on the pure logic** — `src/lib/*.test.ts`
next to the module they cover. That is deliberately where the coverage sits, because that is where
this project's real bugs have been: the `1.005` money-parsing case, the `getDay()` week boundary in
`homeWeekRange`, tiebreak normalisation, and the kitty balance rules. These functions have no DOM,
no network and no auth, so they need no fixtures and run in ~250 ms.

Rules for keeping it useful:
- **A new pure function in `src/lib/` gets a test.** Anything touching Supabase, React or the DOM
  does *not* — mocking the client teaches you about the mock, not the app. Verify that manually via
  the impersonation recipe above.
- **Write the test against measured behaviour, not assumed behaviour.** Probe the function first
  (`npx vite-node`), then pin what it actually does. A test written from an assumption encodes the
  assumption.
- **A suite that has never been red proves nothing.** After adding tests, break the function on
  purpose and confirm they fail. All 44 were mutation-checked this way when they were written.

## Conventions
- UI copy is Dutch. Match existing terminology exactly (e.g. "Beheerder" not "Admin",
  "Aanvoerder" for captain, "Gesp./VD/SC/SB/Goals/Ass." for stats columns, "Al geweest" for past
  matches) — these labels were deliberately chosen by the user, don't retranslate or rephrase them.
- `.claude/settings.local.json` and `supabase/.temp/cli-latest` are local tooling artifacts —
  never commit them.
- Prefer running dev servers via the Browser pane's `preview_start`, not a second `vite`
  instance in Bash. Pin each worktree to its own `--strictPort` port: a stray vite from another
  worktree will happily answer on 5173 and serve you the wrong code while you measure.
- When a bug report says a button/feature "doesn't work" but the code looks correct, actually
  reproduce it live (direct API call + a real click in the browser) before assuming and fixing a
  guessed root cause — twice this session a reported bug turned out to already work, and twice
  a reported-fine feature turned out to hide a real bug (see `match_availability` gotcha above).

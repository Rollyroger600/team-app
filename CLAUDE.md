# CLAUDE.md

Guidance for Claude Code when working in this repository. See [PROJECT_STATUS.md](PROJECT_STATUS.md)
for feature progress and pilot data.

## What this is
Hockey team management PWA for LOHC Heren 30-1 (React 19 + Vite + TS + Zustand +
React Router v7 + TanStack Query + Tailwind v4 + Supabase). Deployed via GitHub → Vercel
(auto-deploy on push to `main`). Pre-season pilot — no real users yet besides the admin (Rogier),
new season starts mid-August 2026. Installed by players as a homescreen PWA on their phones.

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
- Because of that split, `matches.opponent` needs its own resolver: **`useOpponentName()` in
  `src/lib/opponents.ts`**. It loads the league's `league_teams` once (cached under
  `['opponentShortNames', teamId]`) and maps an opponent string onto the admin's short name.
  Render every `match.opponent` through it — Dashboard, Wedstrijden, MatchDetail, Stats, More,
  Opstelling, the umpire cards and the admin screens all do. Two fallbacks are deliberate: a match
  with no league counterpart (friendly, cup game) keeps its own text, and a league team with no
  `short_name` yet gets its " Heren 30-1" suffix trimmed so it still fits on a phone.
  `buildShareText()` takes the resolved name as its 4th argument — the WhatsApp message uses short
  names too.

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

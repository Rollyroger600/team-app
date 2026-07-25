# CLAUDE.md

Guidance for Claude Code when working in this repository. See [PROJECT_STATUS.md](PROJECT_STATUS.md)
for feature progress and pilot data.

## What this is
Hockey team management PWA for HC Leiden Heren 30-1 (React 19 + Vite + TS + Zustand +
React Router v7 + TanStack Query + Tailwind v4 + Supabase). Deployed via GitHub → Vercel
(auto-deploy on push to `main`). Pre-season pilot — no real users yet besides the admin (Rogier).

## Stack quick reference
- Supabase project ref: `fwsjcjyovqikxrzcbovw` (name `Team_APP_Pilot`) — use the Supabase MCP
  tools for migrations/SQL/edge function deploys, or `supabase functions deploy <name>
  --project-ref fwsjcjyovqikxrzcbovw` via CLI if MCP deploy fails.
- Vercel project: `team-app` (team `rollyrogers-projects`), production domain
  `team-app-zeta.vercel.app`.
- `npx tsc --noEmit` after any TS change — there are a couple of known pre-existing unrelated
  errors (AdminPlayers.tsx lucide `title` prop, MatchDetail.tsx `SelectQueryError`); confirm any
  new error is actually caused by your change before worrying about it.

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
- The `club_admin` tier (`club_memberships.role`) has been intentionally collapsed into
  `platform_admin` (as of 2026-07-25) — this app manages a single team, so a club-scoped admin
  role added no real distinction. Rather than ripping it out of every RLS policy and call site,
  the primitives were redefined in place: SQL `is_club_admin_for_team()` now just calls
  `is_platform_admin()`, the edge function's `isClubAdminForTeam()` does the same, and client
  `useAuthStore.isClubAdmin()` is a thin wrapper over `isPlatformAdmin()`. `club_memberships` the
  table still exists (harmless, shown on `/debug`) but no longer grants anything — don't
  reintroduce a real club_admin check without deliberately deciding to un-collapse it.
- `isAdminForTeam` in the edge function checks team_admin OR falls through to
  `isClubAdminForTeam` (→ platform_admin). Keep that fallthrough intact in any refactor.
- A DB trigger (`prevent_unauthorized_role_change`) blocks direct REST updates to
  `team_memberships.role` from anyone but the service role or platform_admin — RLS alone can't
  enforce this at the column level. Its service-role bypass must use `auth.role() = 'service_role'`
  — the legacy GUC `request.jwt.claim.role` is **not** set by this PostgREST version and silently
  rejected every legitimate edge-function role change until fixed (2026-07-25). Don't revert to
  the raw GUC check.

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

## Stats logic
- Shared hook `useTeamStats()` in `src/lib/stats.ts` is the single source of truth for
  Dashboard and Stats page stats (same query key/cache) — don't duplicate the aggregation query
  elsewhere.
- Goal categorization is exact, keep it that way if extending:
  - **VD** (velddoelpunt): scored, `is_penalty` and `is_penalty_corner` both false
  - **SC** (strafcorner): scored + `is_penalty_corner` true
  - **SB** (strafbal): scored + `is_penalty` true
  - **Goals** = VD + SC + SB
- `topByGoals()` / `topByGoalsPlusAssists()` produce the top-3 podium entries; `StatsPodiums`
  (`src/components/ui/MiniPodium.tsx`) renders both podiums as one compact card.

## Testing pattern for verifying admin/player features as a real user
To test as an actual player without ever touching, guessing, or resetting their real PIN: mint a
session directly via their `player_credentials.internal_email` / `internal_password` (curl to
`/auth/v1/token?grant_type=password`), then inject it in the browser with
`supabase.auth.setSession()`. Always delete any temp file holding the token/password afterward.

## Conventions
- UI copy is Dutch. Match existing terminology exactly (e.g. "Beheerder" not "Admin",
  "Aanvoerder" for captain, "Gesp./VD/SC/SB/Goals/Ass." for stats columns) — these labels were
  deliberately chosen by the user, don't retranslate or rephrase them.
- `.claude/settings.local.json` and `supabase/.temp/cli-latest` are local tooling artifacts —
  never commit them.
- Prefer running dev servers via the Browser pane's `preview_start`, not a second `vite`
  instance in Bash — running both caused flakiness with Playwright's own `webServer` before.

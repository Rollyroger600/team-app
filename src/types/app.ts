import type { Database } from './database'

// ── Row shorthands ────────────────────────────────────────────────────────────
export type Tables = Database['public']['Tables']

export type Match        = Tables['matches']['Row']
export type Profile      = Tables['profiles']['Row']
export type Team         = Tables['teams']['Row']
export type Club         = Tables['clubs']['Row']
export type Announcement = Tables['announcements']['Row']
export type Goal         = Tables['goals']['Row']
export type Card         = Tables['match_cards']['Row']
export type UmpireDuty   = Tables['umpire_duties']['Row']
export type League       = Tables['leagues']['Row']
export type LeagueTeam   = Tables['league_teams']['Row']
export type LeagueMatch  = Tables['league_matches']['Row']

// ── Membership with nested joins ──────────────────────────────────────────────
export interface TeamMembership {
  id: string
  team_id: string
  player_id: string
  role: 'player' | 'team_admin' | 'team_owner'
  active: boolean
  created_at: string | null
  teams: (Team & { clubs: (Club & { clubs_registry: { primary_color: string | null; secondary_color: string | null; logo_url: string | null } | null }) | null }) | null
  profiles?: Pick<Profile, 'id' | 'full_name' | 'nickname' | 'email' | 'jersey_number' | 'position'> | null
}

// ── Team settings (fields from team row) ─────────────────────────────────────
export interface TeamSettings {
  gathering_lead_time: number
  travel_buffer_minutes: number
  match_squad_size: number
  // Afronding van de berekende verzameltijd — 0 = geen afronding, anders naar
  // beneden afgerond op het dichtstbijzijnde veelvoud (10 of 15 min), zie
  // calculateGatheringTime() in lib/gathering.ts. Default 15 reproduceert het oude,
  // hardcoded gedrag ("always give extra time") exact.
  gathering_rounding_minutes: number
  // Multi-team fase 2: per-team aan/uit-schakelbare features. Defaults hier moeten
  // het huidige, live gedrag exact reproduceren (alles aan, fluitbeurten
  // auto/zaterdag-voor) — zie 20260816_team_settings_toggles.sql.
  potjescup_enabled: boolean
  potjescup_rules_text: string | null
  fluitbeurten_enabled: boolean
  fluitbeurten_mode: 'auto' | 'manual'
  fluitbeurten_day_of_week: number
  // 'match_day' (op de wedstrijddag zelf) is de meest voorkomende instelling voor
  // thuiswedstrijden — toegevoegd 2026-08-16 naast de vaste-dag-ervoor/erna varianten,
  // zie dutyDateFor() in lib/utils.ts.
  fluitbeurten_relative_to_match: 'before' | 'after' | 'match_day'
  gathering_banner_enabled: boolean
  // Stap 2: uit = geen poule-weergave. De eigen wedstrijdenlijst blijft altijd
  // staan, die hangt aan `matches` en niet aan een league.
  competitie_enabled: boolean
  // Volgorde van de tiebreak-criteria bij gelijke punten. Ruw uit de database:
  // altijd door normalizeTiebreakOrder() in src/lib/standings.ts halen voor gebruik.
  tiebreak_order: string[]
  // Stap 3: trainingen. De standaarden vullen alleen het generatordialoog voor --
  // het schema zelf zijn de gegenereerde `trainings`-rijen.
  trainingen_enabled: boolean
  training_default_weekday: number | null
  training_default_time: string | null
  training_default_duration_minutes: number
  training_interval_weeks: number
  // Stap 4: teamkas. Er is bewust GEEN verwacht bedrag per team: er wordt meerdere
  // keren per seizoen ingelegd en het bedrag verschilt per speler. Wat iemand moet
  // betalen staat in pot_levy_shares, zie src/lib/kitty.ts.
  kitty_enabled: boolean
  kitty_name: string
  // Uit = alleen beheerders zien de kas. Wordt door RLS afgedwongen, niet alleen
  // hier -- een tab verbergen weerhoudt een REST-aanroep nergens van.
  kitty_visible_to_players: boolean
}

// The boolean-valued subset of TeamSettings — used to type any "hide/gate this if
// the toggle is off" prop (BottomNav's flag, FeatureRoute's flag, More.tsx's tab
// filter) so a mistaken non-boolean key (e.g. fluitbeurten_day_of_week) is a
// compile error instead of a silently-broken guard.
export type BooleanSettingKey = { [K in keyof TeamSettings]: TeamSettings[K] extends boolean ? K : never }[keyof TeamSettings]

// ── Availability ──────────────────────────────────────────────────────────────
// 'rostered_off' is admin-only (enforced by a DB trigger, not just the UI).
// Labels, icons and colours live in src/lib/availability.ts.
export type AvailabilityStatus = 'available' | 'unavailable' | 'injured' | 'rostered_off'

export interface MatchAvailability {
  match_id: string
  player_id: string
  status: AvailabilityStatus
  responded_at?: string | null
  profiles?: Pick<Profile, 'full_name' | 'nickname'> | null
}

// ── Umpire ────────────────────────────────────────────────────────────────────
export interface UmpireDutyWithJoins extends UmpireDuty {
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
  matches: Pick<Match, 'id' | 'match_date' | 'opponent' | 'is_home'> | null
}

export interface UmpireGroup {
  match: Pick<Match, 'id' | 'match_date' | 'opponent' | 'is_home'> | null
  duties: UmpireDutyWithJoins[]
  umpireDate: Date | null
}

// ── Goals (with joined names) ─────────────────────────────────────────────────
export interface GoalWithNames extends Goal {
  scorer: Pick<Profile, 'full_name' | 'nickname'> | null
  assist: Pick<Profile, 'full_name' | 'nickname'> | null
}

// ── Stats view ────────────────────────────────────────────────────────────────
export interface PlayerStats {
  player_id: string
  full_name: string
  team_id: string
  matches_played: number | null
  times_rostered_off: number | null
  goals: number | null
  assists: number | null
}

// ── Standings view ────────────────────────────────────────────────────────────
export interface StandingsRow {
  team_id: string
  team_name: string
  league_id: string
  wins: number
  draws: number
  losses: number
  points: number
  goals_for: number
  goals_against: number
  is_own_team: boolean
}

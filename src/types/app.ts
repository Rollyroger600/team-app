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
  role: 'player' | 'team_admin'
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
}

// ── Availability ──────────────────────────────────────────────────────────────
export type AvailabilityStatus = 'available' | 'unavailable' | 'maybe'

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

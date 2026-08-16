import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Team, Club, TeamSettings } from '../types/app'

type ClubWithRegistry = Club & {
  clubs_registry?: {
    primary_color?: string | null
    secondary_color?: string | null
    logo_url?: string | null
  } | null
}

type TeamWithClub = Team & {
  clubs: ClubWithRegistry | null
}

interface TeamState {
  activeTeam: Team | null
  activeClub: ClubWithRegistry | null
  teamSettings: TeamSettings
  setActiveTeam: (team: Team | null, club: ClubWithRegistry | null) => Promise<void>
  refreshTeam: (teamId: string) => Promise<void>
}

const useTeamStore = create<TeamState>((set, get) => ({
  activeTeam: null,
  activeClub: null,
  teamSettings: {
    gathering_lead_time: 30,
    travel_buffer_minutes: 10,
    match_squad_size: 16,
    gathering_rounding_minutes: 15,
    potjescup_enabled: true,
    potjescup_rules_text: null,
    fluitbeurten_enabled: true,
    fluitbeurten_mode: 'auto',
    fluitbeurten_day_of_week: 6,
    fluitbeurten_relative_to_match: 'before',
    gathering_banner_enabled: true,
  },

  setActiveTeam: async (team: Team | null, club: ClubWithRegistry | null) => {
    set({
      activeTeam: team,
      activeClub: club,
      teamSettings: {
        gathering_lead_time: team?.gathering_lead_time ?? 30,
        travel_buffer_minutes: team?.travel_buffer_minutes ?? 10,
        match_squad_size: team?.match_squad_size ?? 16,
        gathering_rounding_minutes: team?.gathering_rounding_minutes ?? 15,
        potjescup_enabled: team?.potjescup_enabled ?? true,
        potjescup_rules_text: team?.potjescup_rules_text ?? null,
        fluitbeurten_enabled: team?.fluitbeurten_enabled ?? true,
        fluitbeurten_mode: (team?.fluitbeurten_mode as 'auto' | 'manual') ?? 'auto',
        fluitbeurten_day_of_week: team?.fluitbeurten_day_of_week ?? 6,
        fluitbeurten_relative_to_match: (team?.fluitbeurten_relative_to_match as 'before' | 'after' | 'match_day') ?? 'before',
        gathering_banner_enabled: team?.gathering_banner_enabled ?? true,
      }
    })
    // Colours no longer come from the club record — the player picks a theme in
    // Instellingen. See src/lib/theme.ts for why applyClubTheme() was removed.
  },

  refreshTeam: async (teamId: string) => {
    const { data: team } = await supabase
      .from('teams')
      .select('*, clubs(*, clubs_registry(primary_color, secondary_color, logo_url))')
      .eq('id', teamId)
      .single()

    if (team) {
      const t = team as unknown as TeamWithClub
      get().setActiveTeam(t, t.clubs)
    }
  }
}))

export default useTeamStore

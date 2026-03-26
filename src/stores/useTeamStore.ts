import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { applyClubTheme } from '../lib/theme'
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
  },

  setActiveTeam: async (team: Team | null, club: ClubWithRegistry | null) => {
    set({
      activeTeam: team,
      activeClub: club,
      teamSettings: {
        gathering_lead_time: team?.gathering_lead_time ?? 30,
        travel_buffer_minutes: team?.travel_buffer_minutes ?? 10,
        match_squad_size: team?.match_squad_size ?? 16,
      }
    })
    if (club) applyClubTheme(club)
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

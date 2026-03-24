import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { applyClubTheme } from '../lib/theme'

const useTeamStore = create((set, get) => ({
  activeTeam: null,
  activeClub: null,
  teamSettings: {
    gathering_lead_time: 30,
    travel_buffer_minutes: 10,
    match_squad_size: 16,
  },

  setActiveTeam: async (team, club) => {
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

  refreshTeam: async (teamId) => {
    const { data: team } = await supabase
      .from('teams')
      .select('*, clubs(*, clubs_registry(primary_color, secondary_color, logo_url))')
      .eq('id', teamId)
      .single()

    if (team) {
      get().setActiveTeam(team, team.clubs)
    }
  }
}))

export default useTeamStore

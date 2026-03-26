import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile, TeamMembership, Team, Club } from '../types/app'

interface AuthState {
  user: User | null
  profile: Profile | null
  memberships: TeamMembership[]
  clubAdminClubIds: string[]
  loading: boolean
  initialized: boolean
  initialize: () => Promise<void>
  loadProfile: (user: User) => Promise<void>
  isPlatformAdmin: () => boolean
  isTeamAdmin: (teamId: string) => boolean
  isAnyTeamAdmin: () => boolean
  isClubAdmin: (clubId?: string) => boolean
  getActiveTeam: () => Team | null
  getActiveClub: () => Club | null
  signOut: () => Promise<void>
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  memberships: [],
  clubAdminClubIds: [],
  loading: true,
  initialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await get().loadProfile(session.user)
    }
    set({ loading: false, initialized: true })

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await get().loadProfile(session.user)
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null, memberships: [], clubAdminClubIds: [] })
      }
    })
  },

  loadProfile: async (user: User) => {
    set({ user })
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const { data: memberships } = await supabase
      .from('team_memberships')
      .select('*, teams(*, clubs(*, clubs_registry(primary_color, secondary_color, logo_url)))')
      .eq('player_id', user.id)

    const { data: clubMemberships } = await supabase
      .from('club_memberships')
      .select('club_id, role')
      .eq('player_id', user.id)
      .eq('role', 'club_admin')

    const clubAdminClubIds = (clubMemberships ?? []).map(cm => cm.club_id)

    set({
      profile: profile as Profile | null,
      memberships: (memberships as unknown as TeamMembership[]) || [],
      clubAdminClubIds,
    })
  },

  isPlatformAdmin: () => {
    const { profile } = get()
    return profile?.is_platform_admin === true
  },

  isTeamAdmin: (teamId: string) => {
    const { memberships } = get()
    return memberships.some(m => m.team_id === teamId && m.role === 'team_admin')
  },

  isAnyTeamAdmin: () => {
    const { memberships } = get()
    return memberships.some(m => m.role === 'team_admin')
  },

  isClubAdmin: (clubId?: string) => {
    const { profile, clubAdminClubIds } = get()
    if (profile?.is_platform_admin) return true
    if (clubId) return clubAdminClubIds.includes(clubId)
    return clubAdminClubIds.length > 0
  },

  getActiveTeam: () => {
    const { memberships } = get()
    return (memberships[0]?.teams as Team | null | undefined) ?? null
  },

  getActiveClub: () => {
    const { memberships } = get()
    const teams = memberships[0]?.teams as (Team & { clubs: Club | null }) | null | undefined
    return teams?.clubs ?? null
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, memberships: [], clubAdminClubIds: [] })
  }
}))

export default useAuthStore

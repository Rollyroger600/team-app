import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile, TeamMembership, Team, Club } from '../types/app'

interface AuthState {
  user: User | null
  profile: Profile | null
  memberships: TeamMembership[]
  loading: boolean
  initialized: boolean
  initialize: () => Promise<void>
  loadProfile: (user: User) => Promise<void>
  isPlatformAdmin: () => boolean
  isTeamAdmin: (teamId: string) => boolean
  isAnyTeamAdmin: () => boolean
  getActiveTeam: () => Team | null
  getActiveClub: () => Club | null
  signOut: () => Promise<void>
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  memberships: [], // team memberships with roles
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
        set({ user: null, profile: null, memberships: [] })
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

    set({ profile: profile as Profile | null, memberships: (memberships as unknown as TeamMembership[]) || [] })
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
    set({ user: null, profile: null, memberships: [] })
  }
}))

export default useAuthStore

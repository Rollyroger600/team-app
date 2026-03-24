import { create } from 'zustand'
import { supabase } from '../lib/supabase'

const useAuthStore = create((set, get) => ({
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

  loadProfile: async (user) => {
    set({ user })
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const { data: memberships } = await supabase
      .from('team_memberships')
      .select('*, teams(*, clubs(*))')
      .eq('player_id', user.id)

    set({ profile, memberships: memberships || [] })
  },

  isPlatformAdmin: () => {
    const { profile } = get()
    return profile?.is_platform_admin === true
  },

  isTeamAdmin: (teamId) => {
    const { memberships } = get()
    return memberships.some(m => m.team_id === teamId && m.role === 'team_admin')
  },

  isAnyTeamAdmin: () => {
    const { memberships } = get()
    return memberships.some(m => m.role === 'team_admin')
  },

  getActiveTeam: () => {
    const { memberships } = get()
    return memberships[0]?.teams || null
  },

  getActiveClub: () => {
    const { memberships } = get()
    return memberships[0]?.teams?.clubs || null
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, memberships: [] })
  }
}))

export default useAuthStore

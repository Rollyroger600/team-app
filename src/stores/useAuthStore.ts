import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile, TeamMembership } from '../types/app'

interface AuthState {
  user: User | null
  profile: Profile | null
  memberships: TeamMembership[]
  loading: boolean
  initialized: boolean
  profileLoaded: boolean
  initialize: () => Promise<void>
  loadProfile: (user: User) => Promise<void>
  isPlatformAdmin: () => boolean
  isTeamAdmin: (teamId: string) => boolean
  isTeamOwner: (teamId: string) => boolean
  isClubAdmin: (clubId?: string | null) => boolean
  signOut: () => Promise<void>
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  memberships: [],
  loading: true,
  initialized: false,
  profileLoaded: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await get().loadProfile(session.user)
    }
    set({ loading: false, initialized: true })

    supabase.auth.onAuthStateChange((event, session) => {
      // Supabase-js holds an internal auth lock for the duration of this
      // callback — awaiting another Supabase call (e.g. loadProfile's
      // .from() queries) directly inside it deadlocks every future call
      // (getSession, setSession, .from(), ...) forever. Defer to the next
      // tick so this callback returns and releases the lock first.
      if (event === 'SIGNED_IN' && session?.user) {
        setTimeout(() => { get().loadProfile(session.user) }, 0)
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null, memberships: [], profileLoaded: false })
      }
    })
  },

  loadProfile: async (user: User) => {
    set({ user })

    // Deze twee query's hangen niet van elkaar af, dus ze gaan tegelijk. Ze
    // stonden achter elkaar en dat kostte op productie ~800 ms op élke start:
    // niets op het scherm kan laden voordat dit klaar is, want het actieve team
    // komt hieruit.
    //
    // De derde query die hier stond -- club_memberships voor clubAdminClubIds --
    // is weg. Het club_admin-niveau is sinds 2026-07-25 samengevouwen in
    // platform_admin en verleent niets meer; de waarde werd alleen op /debug
    // getoond. Hij kostte gemeten 651 ms op het kritieke pad. Debug.tsx haalt hem
    // nu zelf op wanneer die pagina geopend wordt.
    const [profileRes, membershipsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single(),
      // active + joined_at zijn allebei nodig: zonder de filter kan een oude/gearchiveerde
      // membership het actieve team worden, en zonder ORDER BY geeft Postgres de rijen in
      // fysieke volgorde terug (die na een UPDATE kan verschuiven). Zie resolveActiveMembership()
      // in src/lib/activeTeam.ts. Let op: joined_at is de echte kolom — .order('created_at')
      // geeft hier stil een lege lijst terug.
      supabase
        .from('team_memberships')
        .select('*, teams(*, clubs(*, clubs_registry(primary_color, secondary_color, logo_url)))')
        .eq('player_id', user.id)
        .eq('active', true)
        .order('joined_at', { ascending: true }),
    ])

    set({
      profile: profileRes.data as Profile | null,
      memberships: (membershipsRes.data as unknown as TeamMembership[]) || [],
      profileLoaded: true,
    })
  },

  isPlatformAdmin: () => {
    const { profile } = get()
    return profile?.is_platform_admin === true
  },

  // 'team_owner' (Hoofdbeheerder) mag alles wat 'team_admin' (Beheerder) mag — zelfde
  // fallthrough als de DB-functie is_team_admin(), zie 20260814_team_owner_role.sql.
  isTeamAdmin: (teamId: string) => {
    const { memberships } = get()
    return memberships.some(m => m.team_id === teamId && (m.role === 'team_admin' || m.role === 'team_owner'))
  },

  // Bewust GEEN isAnyTeamAdmin() meer: die keek naar álle memberships tegelijk en gaf
  // met twee teams het verkeerde antwoord voor het team dat je bekijkt. Gebruik
  // useIsTeamAdmin()/useIsTeamOwner() uit src/lib/permissions.ts — die binden aan het
  // actieve team.

  // Hoofdbeheerder-specifieke check — voor instellingen/rol-toekenning die zelfs een
  // gewone Beheerder niet mag (zie AdminPlayers.tsx changeRole-gate).
  isTeamOwner: (teamId: string) => {
    const { memberships } = get()
    return memberships.some(m => m.team_id === teamId && m.role === 'team_owner')
  },

  // The separate club_admin tier has been collapsed into platform_admin — this app
  // now manages a single team, so a club-scoped admin role added no real distinction.
  // Kept as its own method (rather than inlining isPlatformAdmin at every call site)
  // so every caller automatically follows if a club_admin tier is ever reintroduced.
  isClubAdmin: (_clubId?: string | null) => {
    return get().isPlatformAdmin()
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, memberships: [], profileLoaded: false })
  }
}))

export default useAuthStore

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'

export default function Debug() {
  const { user, profile, memberships, clubAdminClubIds, loading, initialized, loadProfile } = useAuthStore()
  const [session, setSession] = useState<Record<string, unknown> | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [testing, setTesting] = useState(false)

  function addLog(msg: string) {
    setLog(prev => [...prev, `${new Date().toISOString().slice(11, 23)} ${msg}`])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) setSession({
        user_id: s.user.id,
        email: s.user.email,
        expires_at: new Date((s.expires_at ?? 0) * 1000).toLocaleString(),
        access_token_prefix: s.access_token.slice(0, 20) + '...',
      })
    })
  }, [])

  async function testEdgeFunction() {
    setTesting(true)
    addLog('Testing Edge Function...')
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-handler`
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${s?.access_token ?? ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'get_players_for_login', team_id: memberships[0]?.team_id ?? 'test' }),
      })
      const data = await res.json()
      addLog(`Edge Function status: ${res.status}`)
      addLog(`Response: ${JSON.stringify(data).slice(0, 100)}`)
    } catch (err) {
      addLog(`Error: ${(err as Error).message}`)
    }
    setTesting(false)
  }

  async function forceLoadProfile() {
    addLog('Force loading profile...')
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s?.user) {
      await loadProfile(s.user)
      addLog('Profile loaded')
    } else {
      addLog('No session found')
    }
  }

  async function forceNavigate() {
    addLog('Navigating to home...')
    window.location.href = '/'
  }

  const row = (label: string, value: unknown) => (
    <div className="flex gap-2 text-xs py-1 border-b border-border">
      <span className="text-text-muted w-36 flex-shrink-0">{label}</span>
      <span className="text-text font-mono break-all">{JSON.stringify(value)}</span>
    </div>
  )

  return (
    <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold">Debug</h1>

      <section className="rounded-xl border p-3 space-y-0.5 bg-surface border-border">
        <h2 className="text-sm font-semibold mb-2">Auth Store</h2>
        {row('initialized', initialized)}
        {row('loading', loading)}
        {row('user.id', user?.id ?? null)}
        {row('user.email', user?.email ?? null)}
        {row('profile.display_name', profile?.display_name ?? null)}
        {row('profile.full_name', profile?.full_name ?? null)}
        {row('profile.is_platform_admin', profile?.is_platform_admin ?? null)}
        {row('memberships.length', memberships.length)}
        {row('clubAdminClubIds', clubAdminClubIds)}
      </section>

      <section className="rounded-xl border p-3 space-y-0.5 bg-surface border-border">
        <h2 className="text-sm font-semibold mb-2">Session</h2>
        {session ? Object.entries(session).map(([k, v]) => row(k, v)) : <p className="text-xs text-text-muted">Geen sessie</p>}
      </section>

      {memberships.length > 0 && (
        <section className="rounded-xl border p-3 space-y-0.5 bg-surface border-border">
          <h2 className="text-sm font-semibold mb-2">Memberships</h2>
          {memberships.map((m, i) => (
            <div key={i} className="text-xs py-1 border-b border-border">
              <span className="text-text-muted">team_id: </span>
              <span className="font-mono">{m.team_id}</span>
              <span className="text-text-muted ml-2">role: </span>
              <span className="font-mono">{m.role}</span>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={forceLoadProfile}
          className="py-2 rounded-xl text-sm font-semibold bg-surface border border-border text-text">
          Force load profile
        </button>
        <button onClick={testEdgeFunction} disabled={testing}
          className="py-2 rounded-xl text-sm font-semibold bg-surface border border-border text-text disabled:opacity-50">
          {testing ? 'Testing...' : 'Test Edge Fn'}
        </button>
        <button onClick={forceNavigate}
          className="py-2 rounded-xl text-sm font-semibold bg-secondary text-secondary-text">
          Force → Home
        </button>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
          className="py-2 rounded-xl text-sm font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
          Sign out
        </button>
      </div>

      {log.length > 0 && (
        <section className="rounded-xl border p-3 bg-surface border-border">
          <h2 className="text-sm font-semibold mb-2">Log</h2>
          {log.map((l, i) => (
            <p key={i} className="text-xs font-mono text-text-muted py-0.5">{l}</p>
          ))}
        </section>
      )}
    </div>
  )
}

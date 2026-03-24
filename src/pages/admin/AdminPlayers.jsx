import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users, UserPlus, Mail, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'

const ROLES = [
  { value: 'player', label: 'Speler' },
  { value: 'team_admin', label: 'Admin' },
]

export default function AdminPlayers() {
  const { activeTeam } = useTeamStore()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', jersey_number: '', role: 'player' })
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState(null) // { ok, message }

  useEffect(() => {
    if (!activeTeam?.id) return
    loadPlayers()
  }, [activeTeam?.id])

  async function loadPlayers() {
    setLoading(true)
    const { data } = await supabase
      .from('team_memberships')
      .select('*, profiles(id, full_name, nickname, email, jersey_number, position)')
      .eq('team_id', activeTeam.id)
      .order('created_at', { ascending: true })
    setPlayers(data || [])
    setLoading(false)
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!supabaseAdmin) {
      setInviteResult({ ok: false, message: 'Service role key niet ingesteld (VITE_SUPABASE_SERVICE_ROLE_KEY).' })
      return
    }
    setInviting(true)
    setInviteResult(null)

    const appUrl = window.location.origin
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      form.email.trim().toLowerCase(),
      { redirectTo: `${appUrl}/set-password` }
    )

    if (inviteError) {
      setInviteResult({ ok: false, message: inviteError.message })
      setInviting(false)
      return
    }

    const userId = inviteData.user?.id
    if (!userId) {
      setInviteResult({ ok: false, message: 'Gebruiker aangemaakt maar ID ontbreekt.' })
      setInviting(false)
      return
    }

    // Update profile with name + jersey
    await supabase.from('profiles').update({
      full_name: form.full_name.trim(),
      jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
    }).eq('id', userId)

    // Insert team membership if not exists
    await supabase.from('team_memberships').upsert({
      team_id: activeTeam.id,
      player_id: userId,
      role: form.role,
      active: true,
    }, { onConflict: 'team_id,player_id' })

    setInviteResult({ ok: true, message: `Uitnodiging verstuurd naar ${form.email}.` })
    setForm({ email: '', full_name: '', jersey_number: '', role: 'player' })
    setInviting(false)
    loadPlayers()
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-amber-400'
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">Spelers</h1>
        </div>
        <button
          onClick={() => { setShowInvite(v => !v); setInviteResult(null) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-secondary)', color: '#0f172a' }}
        >
          <UserPlus size={16} />
          Uitnodigen
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-xl border p-4 space-y-3"
             style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Mail size={16} className="text-amber-400" /> Speler uitnodigen via e-mail
          </h2>
          <form onSubmit={handleInvite} className="space-y-2">
            <input
              type="email" required
              placeholder="E-mailadres"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className={inputClass} style={inputStyle}
            />
            <input
              type="text" required
              placeholder="Volledige naam"
              value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className={inputClass} style={inputStyle}
            />
            <div className="flex gap-2">
              <input
                type="number" min="1" max="99"
                placeholder="Rugnummer"
                value={form.jersey_number}
                onChange={e => setForm(p => ({ ...p, jersey_number: e.target.value }))}
                className="w-32 px-3 py-2 rounded-lg text-sm outline-none text-center"
                style={inputStyle}
              />
              <select
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {inviteResult && (
              <p className={`text-xs px-3 py-2 rounded-lg ${inviteResult.ok ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                {inviteResult.message}
              </p>
            )}
            <button
              type="submit"
              disabled={inviting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-secondary)', color: '#0f172a' }}
            >
              {inviting ? 'Versturen...' : 'Uitnodiging versturen'}
            </button>
          </form>
        </div>
      )}

      {/* Player list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-xl p-8 border text-center"
             style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <Users size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 mb-4">Nog geen spelers toegevoegd</p>
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((membership) => {
            const p = membership.profiles
            return (
              <div key={membership.id}
                   className="flex items-center gap-3 p-4 rounded-xl border"
                   style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                     style={{ backgroundColor: 'var(--color-primary)' }}>
                  {p?.jersey_number || p?.full_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {p?.nickname ? `${p.nickname} ` : ''}{p?.full_name || 'Onbekend'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{p?.email}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: membership.role === 'team_admin' ? 'rgba(245,158,11,0.2)' : 'rgba(100,116,139,0.2)',
                        color: membership.role === 'team_admin' ? '#f59e0b' : '#94a3b8'
                      }}>
                  {membership.role === 'team_admin' ? 'Admin' : 'Speler'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users, UserPlus, Mail } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import type { Profile } from '../../types/app'

interface PlayerMembership {
  id: string
  team_id: string
  player_id: string
  role: 'player' | 'team_admin'
  active: boolean
  created_at: string | null
  profiles: Pick<Profile, 'id' | 'full_name' | 'nickname' | 'email' | 'jersey_number' | 'position'> | null
}

interface InviteForm {
  email: string
  full_name: string
  jersey_number: string
  role: string
}

interface InviteResult {
  ok: boolean
  message: string
}

const ROLES = [
  { value: 'player', label: 'Speler' },
  { value: 'team_admin', label: 'Admin' },
]

export default function AdminPlayers(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState<InviteForm>({ email: '', full_name: '', jersey_number: '', role: 'player' })
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)

  const { data: players = [], isLoading } = useQuery<PlayerMembership[]>({
    queryKey: ['adminPlayers', activeTeam?.id],
    queryFn: async (): Promise<PlayerMembership[]> => {
      const { data } = await supabase
        .from('team_memberships')
        .select('*, profiles(id, full_name, nickname, email, jersey_number, position)')
        .eq('team_id', activeTeam!.id)
        .order('created_at', { ascending: true })
      return (data as unknown as PlayerMembership[]) || []
    },
    enabled: !!activeTeam?.id,
  })

  async function handleInvite(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setInviting(true)
    setInviteResult(null)

    const { data, error } = await supabase.functions.invoke('invite-player', {
      body: {
        email: form.email.trim().toLowerCase(),
        full_name: form.full_name.trim(),
        jersey_number: form.jersey_number || null,
        role: form.role,
        team_id: activeTeam!.id,
        redirect_url: `${window.location.origin}/set-password`,
      },
    })

    if (error || !(data as { ok?: boolean })?.ok) {
      setInviteResult({ ok: false, message: (data as { error?: string })?.error || error?.message || 'Onbekende fout' })
      setInviting(false)
      return
    }

    setInviteResult({ ok: true, message: `Uitnodiging verstuurd naar ${form.email}.` })
    setForm({ email: '', full_name: '', jersey_number: '', role: 'player' })
    setInviting(false)
    queryClient.invalidateQueries({ queryKey: ['adminPlayers', activeTeam?.id] })
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-secondary text-secondary-text"
        >
          <UserPlus size={16} />
          Uitnodigen
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-xl border p-4 space-y-3 bg-surface border-border">
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
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 bg-secondary text-secondary-text"
            >
              {inviting ? 'Versturen...' : 'Uitnodiging versturen'}
            </button>
          </form>
        </div>
      )}

      {/* Player list */}
      {isLoading ? (
        <PageLoader />
      ) : players.length === 0 ? (
        <EmptyState icon={Users}>Nog geen spelers toegevoegd</EmptyState>
      ) : (
        <div className="space-y-2">
          {players.map((membership) => {
            const p = membership.profiles
            return (
              <div key={membership.id}
                   className="flex items-center gap-3 p-4 rounded-xl border bg-surface border-border">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 bg-primary">
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

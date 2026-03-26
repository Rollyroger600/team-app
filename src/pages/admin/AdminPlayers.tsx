import React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users, UserPlus, RotateCcw, Check, AlertCircle } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import { createPlayer, resetPlayerPin } from '../../lib/auth'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'
import type { Profile } from '../../types/app'

interface PlayerMembership {
  id: string
  team_id: string
  player_id: string
  role: 'player' | 'team_admin'
  active: boolean
  created_at: string | null
  profiles: Pick<Profile, 'id' | 'full_name' | 'nickname' | 'display_name' | 'jersey_number' | 'position'> | null
}

interface AddForm {
  full_name: string
  display_name: string
  jersey_number: string
  role: string
}

interface ActionResult {
  ok: boolean
  message: string
}

const ROLES = [
  { value: 'player', label: 'Speler' },
  { value: 'team_admin', label: 'Admin' },
]

export default function AdminPlayers(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const { isClubAdmin } = useAuthStore()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<AddForm>({ full_name: '', display_name: '', jersey_number: '', role: 'player' })
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState<ActionResult | null>(null)
  const [resettingPin, setResettingPin] = useState<string | null>(null)
  const [pinResetResults, setPinResetResults] = useState<Record<string, ActionResult>>({})

  const { data: players = [], isLoading } = useQuery<PlayerMembership[]>({
    queryKey: ['adminPlayers', activeTeam?.id],
    queryFn: async (): Promise<PlayerMembership[]> => {
      const { data } = await supabase
        .from('team_memberships')
        .select('*, profiles(id, full_name, nickname, display_name, jersey_number, position)')
        .eq('team_id', activeTeam!.id)
        .order('created_at', { ascending: true })
      return (data as unknown as PlayerMembership[]) || []
    },
    enabled: !!activeTeam?.id,
  })

  async function handleAdd(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setAdding(true)
    setAddResult(null)

    const result = await createPlayer({
      team_id: activeTeam!.id,
      full_name: form.full_name.trim(),
      display_name: form.display_name.trim() || form.full_name.trim().split(' ')[0],
      jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
      role: form.role as 'player' | 'team_admin',
    })

    if (result.error) {
      setAddResult({ ok: false, message: result.error })
      setAdding(false)
      return
    }

    setAddResult({ ok: true, message: `Speler aangemaakt. Ze kunnen nu inloggen met hun naam en PIN instellen.` })
    setForm({ full_name: '', display_name: '', jersey_number: '', role: 'player' })
    setAdding(false)
    queryClient.invalidateQueries({ queryKey: ['adminPlayers', activeTeam?.id] })
  }

  async function handleResetPin(playerId: string): Promise<void> {
    if (!activeTeam?.id) return
    setResettingPin(playerId)
    const result = await resetPlayerPin(playerId, activeTeam.id)
    setResettingPin(null)
    setPinResetResults(prev => ({
      ...prev,
      [playerId]: result.error
        ? { ok: false, message: result.error }
        : { ok: true, message: 'PIN gereset — speler kiest nieuwe PIN bij volgende login' },
    }))
    setTimeout(() => {
      setPinResetResults(prev => { const n = { ...prev }; delete n[playerId]; return n })
    }, 4000)
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-amber-400'
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

  const canResetPin = isClubAdmin()

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
          onClick={() => { setShowAdd(v => !v); setAddResult(null) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-secondary text-secondary-text"
        >
          <UserPlus size={16} />
          Toevoegen
        </button>
      </div>

      {/* Add player form */}
      {showAdd && (
        <div className="rounded-xl border p-4 space-y-3 bg-surface border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <UserPlus size={16} className="text-amber-400" /> Nieuwe speler aanmaken
          </h2>
          <p className="text-xs text-text-muted">
            De speler kiest zelf een pincode bij de eerste keer inloggen.
          </p>
          <form onSubmit={handleAdd} className="space-y-2">
            <input
              type="text" required
              placeholder="Volledige naam (bijv. Kevin de Jong)"
              value={form.full_name}
              onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className={inputClass} style={inputStyle}
            />
            <input
              type="text"
              placeholder="Weergavenaam op loginscherm (bijv. Kevin)"
              value={form.display_name}
              onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
              className={inputClass} style={inputStyle}
            />
            <div className="flex gap-2">
              <input
                type="number" min="1" max="99"
                placeholder="Rugnr."
                value={form.jersey_number}
                onChange={e => setForm(p => ({ ...p, jersey_number: e.target.value }))}
                className="w-28 px-3 py-2 rounded-lg text-sm outline-none text-center"
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
            {addResult && (
              <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${addResult.ok ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                {addResult.ok ? <Check size={13} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />}
                {addResult.message}
              </div>
            )}
            <button
              type="submit"
              disabled={adding}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 bg-secondary text-secondary-text"
            >
              {adding ? 'Aanmaken...' : 'Speler aanmaken'}
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
            const pinResult = pinResetResults[membership.player_id]
            return (
              <div key={membership.id}
                   className="flex items-center gap-3 p-4 rounded-xl border bg-surface border-border">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 bg-primary">
                  {p?.jersey_number || p?.display_name?.[0]?.toUpperCase() || p?.full_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {p?.display_name || p?.full_name || 'Onbekend'}
                  </p>
                  {p?.full_name && p.display_name && p.display_name !== p.full_name && (
                    <p className="text-xs text-slate-400 truncate">{p.full_name}</p>
                  )}
                  {pinResult && (
                    <p className={`text-xs mt-0.5 ${pinResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {pinResult.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs px-2 py-1 rounded-full"
                        style={{
                          backgroundColor: membership.role === 'team_admin' ? 'rgba(245,158,11,0.2)' : 'rgba(100,116,139,0.2)',
                          color: membership.role === 'team_admin' ? '#f59e0b' : '#94a3b8'
                        }}>
                    {membership.role === 'team_admin' ? 'Admin' : 'Speler'}
                  </span>
                  {canResetPin && (
                    <button
                      onClick={() => handleResetPin(membership.player_id)}
                      disabled={resettingPin === membership.player_id}
                      title="PIN resetten"
                      className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30"
                    >
                      <RotateCcw size={14} className={resettingPin === membership.player_id ? 'animate-spin' : ''} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

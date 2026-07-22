import React from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, UserPlus, RotateCcw, Check, AlertCircle, ShieldCheck, Shield, Lock, LogIn } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import { createPlayer, resetPlayerPin, changePlayerRole, getPlayersStatus, impersonatePlayer, type PlayerStatus } from '../../lib/auth'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'
import type { Profile } from '../../types/app'

interface PlayerMembership {
  id: string
  team_id: string
  player_id: string
  role: 'player' | 'team_admin'
  active: boolean
  joined_at: string | null
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
  { value: 'team_admin', label: 'Aanvoerder' },
]

function roleLabel(role: string) {
  return role === 'team_admin' ? 'Aanvoerder' : 'Speler'
}

function roleBadgeStyle(role: string) {
  return role === 'team_admin'
    ? { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
    : { backgroundColor: 'rgba(100,116,139,0.15)', color: '#94a3b8' }
}

export default function AdminPlayers(): React.JSX.Element {
  const navigate = useNavigate()
  const { activeTeam } = useTeamStore()
  const { isClubAdmin, loadProfile } = useAuthStore()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<AddForm>({ full_name: '', display_name: '', jersey_number: '', role: 'player' })
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState<ActionResult | null>(null)
  const [resettingPin, setResettingPin] = useState<string | null>(null)
  const [pinResetResults, setPinResetResults] = useState<Record<string, ActionResult>>({})
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({})
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [impersonateErrors, setImpersonateErrors] = useState<Record<string, string>>({})

  const canManage = isClubAdmin(activeTeam?.club_id)

  const { data: players = [], isLoading } = useQuery<PlayerMembership[]>({
    queryKey: ['adminPlayers', activeTeam?.id],
    queryFn: async (): Promise<PlayerMembership[]> => {
      const { data } = await supabase
        .from('team_memberships')
        .select('*, profiles(id, full_name, nickname, display_name, jersey_number, position)')
        .eq('team_id', activeTeam!.id)
        .eq('active', true)
        .order('joined_at', { ascending: true })
      return (data as unknown as PlayerMembership[]) || []
    },
    enabled: !!activeTeam?.id,
  })

  const { data: statuses = [] } = useQuery<PlayerStatus[]>({
    queryKey: ['adminPlayersStatus', activeTeam?.id],
    queryFn: async (): Promise<PlayerStatus[]> => {
      const { statuses: s } = await getPlayersStatus(activeTeam!.id)
      return s
    },
    enabled: !!activeTeam?.id && canManage,
  })

  const statusMap: Record<string, PlayerStatus> = {}
  for (const s of statuses) statusMap[s.player_id] = s

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

    setAddResult({ ok: true, message: 'Speler aangemaakt. Ze kunnen nu inloggen en hun pincode instellen.' })
    setForm({ full_name: '', display_name: '', jersey_number: '', role: 'player' })
    setAdding(false)
    queryClient.invalidateQueries({ queryKey: ['adminPlayers', activeTeam?.id] })
    queryClient.invalidateQueries({ queryKey: ['adminPlayersStatus', activeTeam?.id] })
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
        : { ok: true, message: 'PIN gereset — speler kiest nieuwe bij volgende login' },
    }))
    setTimeout(() => {
      setPinResetResults(prev => { const n = { ...prev }; delete n[playerId]; return n })
    }, 4000)
    queryClient.invalidateQueries({ queryKey: ['adminPlayersStatus', activeTeam?.id] })
  }

  async function handleToggleRole(membership: PlayerMembership): Promise<void> {
    if (!canManage || !activeTeam?.id) return
    const newRole = membership.role === 'team_admin' ? 'player' : 'team_admin'
    setChangingRole(membership.player_id)
    const result = await changePlayerRole(membership.player_id, activeTeam.id, newRole)
    setChangingRole(null)
    if (result.error) {
      setRoleErrors(prev => ({ ...prev, [membership.player_id]: result.error! }))
      setTimeout(() => setRoleErrors(prev => { const n = { ...prev }; delete n[membership.player_id]; return n }), 4000)
    } else {
      queryClient.invalidateQueries({ queryKey: ['adminPlayers', activeTeam?.id] })
    }
  }

  async function handleImpersonate(membership: PlayerMembership): Promise<void> {
    if (!canManage || !activeTeam?.id) return
    setImpersonateErrors(prev => { const n = { ...prev }; delete n[membership.player_id]; return n })
    setImpersonating(membership.player_id)
    const result = await impersonatePlayer(membership.player_id, activeTeam.id)
    if (result.error) {
      setImpersonating(null)
      setImpersonateErrors(prev => ({ ...prev, [membership.player_id]: result.error! }))
      setTimeout(() => setImpersonateErrors(prev => { const n = { ...prev }; delete n[membership.player_id]; return n }), 4000)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await loadProfile(session.user)
    navigate('/')
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
        {canManage && (
          <button
            onClick={() => { setShowAdd(v => !v); setAddResult(null) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-secondary text-secondary-text"
          >
            <UserPlus size={16} />
            Toevoegen
          </button>
        )}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-text-muted px-1">
        <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-amber-400" /> Aanvoerder</span>
        <span className="flex items-center gap-1"><Check size={12} className="text-green-400" /> PIN ingesteld</span>
        <span className="flex items-center gap-1"><AlertCircle size={12} className="text-orange-400" /> PIN niet ingesteld</span>
        <span className="flex items-center gap-1"><Lock size={12} className="text-red-400" /> Geblokkeerd</span>
      </div>

      {/* Speler toevoegen */}
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

      {/* Spelerslijst */}
      {isLoading ? (
        <PageLoader />
      ) : players.length === 0 ? (
        <EmptyState icon={Users}>Nog geen spelers toegevoegd</EmptyState>
      ) : (
        <div className="space-y-2">
          {players.map((membership) => {
            const p = membership.profiles
            const status = statusMap[membership.player_id]
            const pinResult = pinResetResults[membership.player_id]
            const roleErr = roleErrors[membership.player_id]
            const isLocked = status?.locked_until && new Date(status.locked_until) > new Date()

            return (
              <div key={membership.id}
                   className="flex items-center gap-3 p-3 rounded-xl border bg-surface border-border">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 bg-primary">
                  {p?.jersey_number != null
                    ? p.jersey_number
                    : (p?.display_name?.[0] ?? p?.full_name?.[0] ?? '?').toUpperCase()}
                </div>

                {/* Naam */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {membership.role === 'team_admin' && (
                      <ShieldCheck size={13} className="text-amber-400 flex-shrink-0" />
                    )}
                    <p className="font-medium text-sm truncate">
                      {p?.display_name || p?.full_name || 'Onbekend'}
                    </p>
                  </div>
                  {p?.full_name && p.display_name && p.display_name !== p.full_name && (
                    <p className="text-xs text-slate-400 truncate">{p.full_name}</p>
                  )}
                  {/* Feedback berichten */}
                  {pinResult && (
                    <p className={`text-xs mt-0.5 ${pinResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {pinResult.message}
                    </p>
                  )}
                  {roleErr && <p className="text-xs mt-0.5 text-red-400">{roleErr}</p>}
                  {impersonateErrors[membership.player_id] && (
                    <p className="text-xs mt-0.5 text-red-400">{impersonateErrors[membership.player_id]}</p>
                  )}
                </div>

                {/* Status + acties */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* PIN status */}
                  {status && (
                    isLocked
                      ? <Lock size={14} className="text-red-400" title="Account geblokkeerd" />
                      : status.has_set_pin
                        ? <Check size={14} className="text-green-400" title="PIN ingesteld" />
                        : <AlertCircle size={14} className="text-orange-400" title="PIN nog niet ingesteld" />
                  )}

                  {/* Rol badge */}
                  <span className="text-xs px-2 py-0.5 rounded-full" style={roleBadgeStyle(membership.role)}>
                    {roleLabel(membership.role)}
                  </span>

                  {/* Rol toggle — alleen club_admin */}
                  {canManage && (
                    <button
                      onClick={() => handleToggleRole(membership)}
                      disabled={changingRole === membership.player_id}
                      title={membership.role === 'team_admin' ? 'Terug naar speler' : 'Maak aanvoerder'}
                      className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity disabled:opacity-20"
                    >
                      {changingRole === membership.player_id
                        ? <RotateCcw size={13} className="animate-spin" />
                        : membership.role === 'team_admin'
                          ? <Shield size={13} />
                          : <ShieldCheck size={13} />
                      }
                    </button>
                  )}

                  {/* PIN reset — alleen club_admin */}
                  {canManage && (
                    <button
                      onClick={() => handleResetPin(membership.player_id)}
                      disabled={resettingPin === membership.player_id}
                      title="PIN resetten"
                      className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity disabled:opacity-20"
                    >
                      <RotateCcw size={13} className={resettingPin === membership.player_id ? 'animate-spin' : ''} />
                    </button>
                  )}

                  {/* Inloggen als — alleen club_admin, voor support/testen */}
                  {canManage && (
                    <button
                      onClick={() => handleImpersonate(membership)}
                      disabled={impersonating === membership.player_id}
                      title="Inloggen als deze speler"
                      className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity disabled:opacity-20"
                    >
                      <LogIn size={13} className={impersonating === membership.player_id ? 'animate-pulse' : ''} />
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

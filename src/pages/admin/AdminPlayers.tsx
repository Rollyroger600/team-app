import React from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, UserPlus, RotateCcw, Check, AlertCircle, Shield, KeyRound, Crown, Lock, LogIn, MoreVertical } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import { tint } from '../../lib/utils'
import { createPlayer, resetPlayerPin, changePlayerRole, setPlayerCaptain, getPlayersStatus, impersonatePlayer, type PlayerStatus } from '../../lib/auth'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'
import { useIsTeamOwner } from '../../lib/permissions'
import type { Profile } from '../../types/app'

interface PlayerMembership {
  id: string
  team_id: string
  player_id: string
  role: 'player' | 'team_admin' | 'team_owner'
  is_captain: boolean | null
  active: boolean
  joined_at: string | null
  profiles: Pick<Profile, 'id' | 'full_name' | 'nickname' | 'display_name' | 'jersey_number' | 'position'> | null
}

interface AddForm {
  full_name: string
  display_name: string
  jersey_number: string
}

interface ActionResult {
  ok: boolean
  message: string
}

export default function AdminPlayers(): React.JSX.Element {
  const navigate = useNavigate()
  const { activeTeam } = useTeamStore()
  const { loadProfile } = useAuthStore()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<AddForm>({ full_name: '', display_name: '', jersey_number: '' })
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState<ActionResult | null>(null)
  const [resettingPin, setResettingPin] = useState<string | null>(null)
  const [pinResetResults, setPinResetResults] = useState<Record<string, ActionResult>>({})
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({})
  const [changingCaptain, setChangingCaptain] = useState<string | null>(null)
  const [captainErrors, setCaptainErrors] = useState<Record<string, string>>({})
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [impersonateErrors, setImpersonateErrors] = useState<Record<string, string>>({})
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)

  // Hoofdbeheerder mag hier net als de platform-admin komen én, sinds 2026-08-16, ook
  // zelf andere hoofdbeheerders aanwijzen/degraderen binnen het eigen team — zie de
  // changeRole edge-function actie. platform_admin blijft de enige die dit over alle
  // teams heen kan, maar binnen dít team is er geen apart onderscheid meer nodig.
  const canManage = useIsTeamOwner()

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
      role: 'player',
    })

    if (result.error) {
      setAddResult({ ok: false, message: result.error })
      setAdding(false)
      return
    }

    setAddResult({ ok: true, message: 'Speler aangemaakt. Ze kunnen nu inloggen en hun pincode instellen.' })
    setForm({ full_name: '', display_name: '', jersey_number: '' })
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

  async function handleSetRole(membership: PlayerMembership, newRole: 'player' | 'team_admin' | 'team_owner'): Promise<void> {
    if (!canManage || !activeTeam?.id) return
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

  async function handleToggleCaptain(membership: PlayerMembership): Promise<void> {
    if (!canManage || !activeTeam?.id) return
    setChangingCaptain(membership.player_id)
    const result = await setPlayerCaptain(membership.player_id, activeTeam.id, !membership.is_captain)
    setChangingCaptain(null)
    if (result.error) {
      setCaptainErrors(prev => ({ ...prev, [membership.player_id]: result.error! }))
      setTimeout(() => setCaptainErrors(prev => { const n = { ...prev }; delete n[membership.player_id]; return n }), 4000)
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

  const inputClass = 'w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-secondary-soft'
  const inputStyle = { backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-text-muted hover:text-text">
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted px-1">
        <span className="flex items-center gap-1"><Shield size={12} className="text-info" /> Aanvoerder (op het veld)</span>
        <span className="flex items-center gap-1"><KeyRound size={12} className="text-secondary-soft" /> Beheerder (app-toegang)</span>
        <span className="flex items-center gap-1"><Crown size={12} className="text-secondary-soft" /> Hoofdbeheerder (+ instellingen &amp; rollen)</span>
        <span className="flex items-center gap-1"><Check size={12} className="text-success" /> PIN ingesteld</span>
        <span className="flex items-center gap-1"><AlertCircle size={12} className="text-orange-400" /> PIN niet ingesteld</span>
        <span className="flex items-center gap-1"><Lock size={12} className="text-danger" /> Geblokkeerd</span>
      </div>

      {/* Speler toevoegen */}
      {showAdd && (
        <div className="rounded-xl border p-4 space-y-3 bg-surface border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <UserPlus size={16} className="text-secondary-soft" /> Nieuwe speler aanmaken
          </h2>
          <p className="text-xs text-text-muted">
            De speler kiest zelf een pincode bij de eerste keer inloggen. Aanvoerder- en beheerderstatus stel je daarna in via het menu bij de speler.
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
            <input
              type="number" min="1" max="99"
              placeholder="Rugnr. (optioneel)"
              value={form.jersey_number}
              onChange={e => setForm(p => ({ ...p, jersey_number: e.target.value }))}
              className={inputClass} style={inputStyle}
            />
            {addResult && (
              <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${addResult.ok ? 'text-success bg-available/10' : 'text-danger bg-unavailable/10'}`}>
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
            const captainErr = captainErrors[membership.player_id]
            const isLocked = status?.locked_until && new Date(status.locked_until) > new Date()
            const name = p?.display_name || p?.full_name || 'Onbekend'
            const menuOpen = openMenuFor === membership.player_id

            return (
              <div key={membership.id}
                   className="flex items-center gap-3 p-3 rounded-xl border bg-surface border-border">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 bg-primary text-primary-text">
                  {p?.jersey_number != null
                    ? p.jersey_number
                    : (p?.display_name?.[0] ?? p?.full_name?.[0] ?? '?').toUpperCase()}
                </div>

                {/* Naam + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-medium text-sm truncate">{name}</p>
                    {membership.is_captain && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0"
                            style={{ backgroundColor: tint('--color-info', 15), color: 'var(--color-info)' }}>
                        <Shield size={10} /> Aanvoerder
                      </span>
                    )}
                    {membership.role === 'team_admin' && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0"
                            style={{ backgroundColor: tint('--color-secondary', 15), color: 'var(--color-secondary)' }}>
                        <KeyRound size={10} /> Beheerder
                      </span>
                    )}
                    {membership.role === 'team_owner' && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0"
                            style={{ backgroundColor: tint('--color-secondary', 15), color: 'var(--color-secondary)' }}>
                        <Crown size={10} /> Hoofdbeheerder
                      </span>
                    )}
                  </div>
                  {p?.full_name && p.display_name && p.display_name !== p.full_name && (
                    <p className="text-xs text-text-muted truncate">{p.full_name}</p>
                  )}
                  {/* Feedback berichten */}
                  {pinResult && (
                    <p className={`text-xs mt-0.5 ${pinResult.ok ? 'text-success' : 'text-danger'}`}>
                      {pinResult.message}
                    </p>
                  )}
                  {roleErr && <p className="text-xs mt-0.5 text-danger">{roleErr}</p>}
                  {captainErr && <p className="text-xs mt-0.5 text-danger">{captainErr}</p>}
                  {impersonateErrors[membership.player_id] && (
                    <p className="text-xs mt-0.5 text-danger">{impersonateErrors[membership.player_id]}</p>
                  )}
                </div>

                {/* PIN status — title lives on a wrapper span; lucide icons don't take it */}
                {status && (
                  isLocked
                    ? <span className="flex-shrink-0" title="Account geblokkeerd"><Lock size={14} className="text-danger" /></span>
                    : status.has_set_pin
                      ? <span className="flex-shrink-0" title="PIN ingesteld"><Check size={14} className="text-success" /></span>
                      : <span className="flex-shrink-0" title="PIN nog niet ingesteld"><AlertCircle size={14} className="text-orange-400" /></span>
                )}

                {/* Acties-menu — alleen de platform-admin */}
                {canManage && (
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setOpenMenuFor(menuOpen ? null : membership.player_id)}
                      className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-surface-2 transition-all"
                      title="Acties"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {menuOpen && (
                      <>
                        {/* Klik buiten het menu om te sluiten */}
                        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuFor(null)} />
                        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border shadow-lg overflow-hidden bg-surface border-border">
                          <button
                            onClick={() => { setOpenMenuFor(null); handleToggleCaptain(membership) }}
                            disabled={changingCaptain === membership.player_id}
                            className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-surface-2 text-text disabled:opacity-40"
                          >
                            <Shield size={15} className="text-info flex-shrink-0" />
                            {changingCaptain === membership.player_id
                              ? 'Bezig...'
                              : membership.is_captain ? 'Aanvoerder verwijderen' : 'Maak aanvoerder'}
                          </button>
                          {/* Speler ↔ Beheerder — voor Hoofdbeheerder én platform-admin.
                              Niet getoond voor een Hoofdbeheerder-rij zelf: die rol kan
                              alleen de platform-admin aan/uit zetten, via de knop hieronder. */}
                          {membership.role !== 'team_owner' && (
                            <button
                              onClick={() => { setOpenMenuFor(null); handleSetRole(membership, membership.role === 'team_admin' ? 'player' : 'team_admin') }}
                              disabled={changingRole === membership.player_id}
                              className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-surface-2 text-text border-t border-border disabled:opacity-40"
                            >
                              <KeyRound size={15} className="text-secondary-soft flex-shrink-0" />
                              {changingRole === membership.player_id
                                ? 'Bezig...'
                                : membership.role === 'team_admin' ? 'Beheerder verwijderen' : 'Maak beheerder'}
                            </button>
                          )}
                          {/* Hoofdbeheerder toekennen/afpakken — elke hoofdbeheerder mag
                              dit binnen zijn eigen team, niet alleen platform_admin. */}
                          {canManage && (
                            <button
                              onClick={() => { setOpenMenuFor(null); handleSetRole(membership, membership.role === 'team_owner' ? 'team_admin' : 'team_owner') }}
                              disabled={changingRole === membership.player_id}
                              className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-surface-2 text-text border-t border-border disabled:opacity-40"
                            >
                              <Crown size={15} className="text-secondary-soft flex-shrink-0" />
                              {changingRole === membership.player_id
                                ? 'Bezig...'
                                : membership.role === 'team_owner' ? 'Hoofdbeheerder verwijderen' : 'Maak hoofdbeheerder'}
                            </button>
                          )}
                          <button
                            onClick={() => { setOpenMenuFor(null); handleResetPin(membership.player_id) }}
                            disabled={resettingPin === membership.player_id}
                            className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-surface-2 text-text border-t border-border disabled:opacity-40"
                          >
                            <RotateCcw size={15} className="text-text-muted flex-shrink-0" />
                            {resettingPin === membership.player_id ? 'Bezig...' : 'PIN resetten'}
                          </button>
                          <button
                            onClick={() => { setOpenMenuFor(null); handleImpersonate(membership) }}
                            disabled={impersonating === membership.player_id}
                            className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-surface-2 text-text border-t border-border disabled:opacity-40"
                          >
                            <LogIn size={15} className="text-text-muted flex-shrink-0" />
                            {impersonating === membership.player_id ? 'Bezig...' : `Inloggen als ${name}`}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

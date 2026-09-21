import React from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trophy, Plus, Trash2, Settings, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { formatDate } from '../../lib/utils'
import type { Profile } from '../../types/app'
import { parsePotjescupPoints, POTJESCUP_MAX_POINTS } from '../../lib/potjescup'

interface ScoreItem {
  id: string
  player_id: string
  points: number
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

interface SessionItem {
  id: string
  session_date: string
  scores: ScoreItem[]
}

interface PlayerItem {
  player_id: string
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

interface PotjescupQueryData {
  sessions: SessionItem[]
  players: PlayerItem[]
}

const POINT_OPTIONS = [0, 0.5, 1] as const

/** 2.5 -> "2,5". Punten staan in het Nederlands met een komma. */
function formatPunten(n: number): string {
  return String(n).replace('.', ',')
}

/**
 * Het vierde vakje naast 0 / 0,5 / 1: een eigen aantal, 0 t/m 9, voor wie extra
 * punten verdiende. Staat er een waarde die niet op een van de knoppen past, dan
 * staat die hier -- gemarkeerd, net als een gekozen knop.
 *
 * Opslaan gebeurt bij Enter of bij het verlaten van het veld, niet bij elke
 * toetsaanslag: anders gaat "2,5" onderweg als "2" de database in.
 */
function EigenPunten({ value, onSave }: { value: number; onSave: (n: number) => Promise<void> }): React.JSX.Element {
  const isEigen = !(POINT_OPTIONS as readonly number[]).includes(value)
  const [concept, setConcept] = useState(isEigen ? formatPunten(value) : '')
  const [fout, setFout] = useState(false)

  // Meebewegen als de waarde van buitenaf verandert (een knop, of een refetch).
  useEffect(() => {
    setConcept(isEigen ? formatPunten(value) : '')
    setFout(false)
  }, [value, isEigen])

  async function bevestig(): Promise<void> {
    if (concept.trim() === '') { setConcept(isEigen ? formatPunten(value) : ''); setFout(false); return }
    const n = parsePotjescupPoints(concept)
    if (n === null) { setFout(true); return }
    setFout(false)
    if (n !== value) {
      try { await onSave(n) } catch { setFout(true) }
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={concept}
      placeholder="…"
      aria-label="Eigen aantal punten"
      title={fout ? `Vul 0 t/m ${POTJESCUP_MAX_POINTS} in (halve punten mogen)` : `Eigen aantal, 0 t/m ${POTJESCUP_MAX_POINTS}`}
      onChange={e => { setConcept(e.target.value); setFout(false) }}
      onBlur={bevestig}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`w-10 h-8 rounded-lg text-xs font-semibold text-center outline-none transition-colors ${
        fout
          ? 'bg-surface-2 text-danger border border-danger'
          : isEigen && concept !== ''
            ? 'bg-secondary text-secondary-text'
            : 'bg-surface-2 text-text-muted placeholder:text-text-faint focus:text-text'
      }`}
    />
  )
}

export default function AdminPotjescup(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [creating, setCreating] = useState(false)
  // Welke trainingen openstaan. Leeg = alles dicht, en zo opent het scherm.
  const [openSessions, setOpenSessions] = useState<Set<string>>(() => new Set())

  function toggleSession(id: string): void {
    setOpenSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data, isLoading } = useQuery<PotjescupQueryData>({
    queryKey: ['adminPotjescup', activeTeam?.id],
    queryFn: async (): Promise<PotjescupQueryData> => {
      const [sessionsRes, playersRes] = await Promise.all([
        supabase.from('potjescup_sessions')
          .select('id, session_date, scores:potjescup_scores(id, player_id, points, profiles(full_name, nickname))')
          .eq('team_id', activeTeam!.id)
          .order('session_date', { ascending: false }),
        supabase.from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam!.id)
          .eq('active', true),
      ])

      return {
        sessions: (sessionsRes.data as unknown as SessionItem[]) || [],
        players: (playersRes.data as unknown as PlayerItem[]) || [],
      }
    },
    enabled: !!activeTeam?.id,
  })

  const sessions = data?.sessions || []
  const players = data?.players || []

  function invalidateAll(): void {
    queryClient.invalidateQueries({ queryKey: ['adminPotjescup', activeTeam?.id] })
    queryClient.invalidateQueries({ queryKey: ['potjescupStats', activeTeam?.id] })
    queryClient.invalidateQueries({ queryKey: ['potjescupHistory', activeTeam?.id] })
  }

  const updatePointsMutation = useMutation<void, Error, { scoreId: string; points: number }>({
    mutationFn: async ({ scoreId, points }): Promise<void> => {
      // Een fout moet hier naar boven komen: met een vrij invulveld is een door
      // de database geweigerde waarde een reële mogelijkheid, en die mag niet
      // stil verdwijnen terwijl het scherm doet alsof hij is opgeslagen.
      const { error } = await supabase.from('potjescup_scores').update({ points }).eq('id', scoreId)
      if (error) throw error
    },
    onSuccess: invalidateAll,
  })

  const deleteSessionMutation = useMutation<void, Error, string>({
    mutationFn: async (sessionId: string): Promise<void> => {
      await supabase.from('potjescup_sessions').delete().eq('id', sessionId)
    },
    onSuccess: invalidateAll,
  })

  async function createSession(): Promise<void> {
    if (!newDate || !activeTeam || players.length === 0) return
    setCreating(true)

    const { data: session, error } = await supabase
      .from('potjescup_sessions')
      .insert({ team_id: activeTeam.id, session_date: newDate })
      .select('id')
      .single()

    if (!error && session) {
      await supabase.from('potjescup_scores').insert(
        players.map(p => ({ session_id: session.id, player_id: p.player_id, points: 0 }))
      )
      // Een training die je net toevoegt wil je meteen invullen; die gaat dus open.
      setOpenSessions(prev => new Set(prev).add(session.id))
    }

    setCreating(false)
    invalidateAll()
  }

  async function setPoints(scoreId: string, points: number): Promise<void> {
    await updatePointsMutation.mutateAsync({ scoreId, points })
  }

  async function deleteSession(sessionId: string, sessionDate: string): Promise<void> {
    // Cascade neemt alle score-rijen van deze training mee en is niet terug te draaien —
    // zelfde bevestigingspatroon als bij fluitbeurten en aankondigingen.
    if (!window.confirm(
      `Training van ${formatDate(sessionDate)} verwijderen? De punten van alle spelers voor deze training gaan verloren.`
    )) return
    await deleteSessionMutation.mutateAsync(sessionId)
  }

  const playerName = (p: { profiles: Pick<Profile, 'full_name' | 'nickname'> | null }): string =>
    p?.profiles?.nickname || p?.profiles?.full_name?.split(' ')[0] || '?'

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Potjescup</h1>
      </div>

      {/* Spelregels bewerken zit sinds 2026-08-16 bij Team instellingen (naast de
          andere Potjescup/Fluitbeurten-toggles), niet hier — dit scherm blijft de
          sessie/puntentoekenning-CRUD. */}
      <Link
        to="/admin/settings"
        className="flex items-center gap-2 text-xs text-text-muted hover:text-text px-1"
      >
        <Settings size={13} />
        Spelregels aanpassen? Dat doe je via Team instellingen.
      </Link>

      {/* Nieuwe training toevoegen */}
      <div className="rounded-xl p-4 border space-y-2 bg-surface border-border">
        <p className="text-sm text-text-muted">
          Voeg een training toe om na de eindpartij punten toe te kennen aan alle spelers.
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none bg-surface-2 text-text"
            style={{ border: '1px solid var(--color-border)' }}
          />
          <button
            onClick={createSession}
            disabled={creating || !newDate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors bg-secondary text-secondary-text"
          >
            <Plus size={16} />
            {creating ? 'Bezig...' : 'Toevoegen'}
          </button>
        </div>
      </div>

      {/* Trainingen met puntentoekenning */}
      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={Trophy}>Nog geen trainingen. Voeg er hierboven een toe.</EmptyState>
      ) : (
        <div className="space-y-3">
          {/* Standaard alles dicht: elke training is 22 regels, en na een paar weken
              scroll je anders langs honderden namen naar de training van vandaag. */}
          {sessions.length > 1 && (
            <div className="flex justify-end">
              <button
                onClick={() => setOpenSessions(sessions.some(x => openSessions.has(x.id)) ? new Set() : new Set(sessions.map(x => x.id)))}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                {sessions.some(x => openSessions.has(x.id)) ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
                {sessions.some(x => openSessions.has(x.id)) ? 'Alles inklappen' : 'Alles uitklappen'}
              </button>
            </div>
          )}

          {sessions.map(session => {
            const open = openSessions.has(session.id)
            const metPunten = session.scores.filter(sc => sc.points > 0)
            const totaal = metPunten.reduce((a, sc) => a + Number(sc.points), 0)
            return (
            <div key={session.id} className="rounded-xl border overflow-hidden bg-surface border-border">
              <div className={`flex items-center ${open ? 'border-b border-border' : ''}`}>
                <button
                  onClick={() => toggleSession(session.id)}
                  aria-expanded={open}
                  className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-sm">{formatDate(session.session_date)}</span>
                    {!open && (
                      <span className="block text-[11px] text-text-subtle">
                        {metPunten.length === 0
                          ? 'Nog geen punten toegekend'
                          : `${metPunten.length} speler${metPunten.length === 1 ? '' : 's'} met punten · ${formatPunten(totaal)} punt${totaal === 1 ? '' : 'en'}`}
                      </span>
                    )}
                  </span>
                  {open ? <ChevronUp size={16} className="text-text-subtle flex-shrink-0" /> : <ChevronDown size={16} className="text-text-subtle flex-shrink-0" />}
                </button>
                <button onClick={() => deleteSession(session.id, session.session_date)}
                        title="Training verwijderen"
                        className="text-text-faint hover:text-danger transition-colors p-3 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>

              {open && session.scores.map(score => (
                <div key={score.id}
                     className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <span className="flex-1 text-sm font-medium truncate">{playerName(score)}</span>
                  <div className="flex gap-1">
                    {POINT_OPTIONS.map(pt => (
                      <button
                        key={pt}
                        onClick={() => setPoints(score.id, pt)}
                        className={`w-10 h-8 rounded-lg text-xs font-semibold transition-colors ${
                          Number(score.points) === pt
                            ? 'bg-secondary text-secondary-text'
                            : 'bg-surface-2 text-text-muted hover:text-text'
                        }`}
                      >
                        {formatPunten(pt)}
                      </button>
                    ))}
                    <EigenPunten value={Number(score.points)} onSave={n => setPoints(score.id, n)} />
                  </div>
                </div>
              ))}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

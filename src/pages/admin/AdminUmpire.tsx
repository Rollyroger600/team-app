import React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Flag, Wand2, Trash2, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { formatDate } from '../../lib/utils'
import { useOpponentName } from '../../lib/opponents'
import { groupDuties } from '../../components/ui/UmpireCard'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { DAY_NAMES_NL, dutyDateFor } from '../../lib/utils'
import type { Profile, UmpireDutyWithJoins, UmpireGroup } from '../../types/app'

interface MatchItem {
  id: string
  match_date: string
  match_time: string | null
  opponent: string
  is_home: boolean
}

interface PlayerItem {
  player_id: string
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

interface UmpireQueryData {
  duties: UmpireDutyWithJoins[]
  matches: MatchItem[]
  players: PlayerItem[]
}

export default function AdminUmpire(): React.JSX.Element {
  const opponentName = useOpponentName()
  const { activeTeam, teamSettings } = useTeamStore()
  const queryClient = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState('')

  const [showManualForm, setShowManualForm] = useState(false)
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0])
  const [manualDesc, setManualDesc] = useState('')
  const [manualPlayer1, setManualPlayer1] = useState('')
  const [manualPlayer2, setManualPlayer2] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState('')

  const { data, isLoading } = useQuery<UmpireQueryData>({
    queryKey: ['adminUmpire', activeTeam?.id],
    queryFn: async (): Promise<UmpireQueryData> => {
      const today = new Date().toISOString().split('T')[0]

      const [dutiesRes, matchesRes, playersRes] = await Promise.all([
        supabase.from('umpire_duties')
          .select('id, match_id, player_id, umpire_match_desc, duty_date, notes, status, profiles(full_name, nickname), matches(id, match_date, opponent, is_home)')
          .eq('team_id', activeTeam!.id)
          .order('created_at', { ascending: true }),
        supabase.from('matches')
          .select('id, match_date, match_time, opponent, is_home')
          .eq('team_id', activeTeam!.id)
          .gte('match_date', today)
          .order('match_date', { ascending: true }),
        supabase.from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam!.id)
          .eq('active', true),
      ])

      return {
        duties: (dutiesRes.data as unknown as UmpireDutyWithJoins[]) || [],
        matches: (matchesRes.data as MatchItem[]) || [],
        players: (playersRes.data as unknown as PlayerItem[]) || [],
      }
    },
    enabled: !!activeTeam?.id && teamSettings.fluitbeurten_enabled,
  })

  const duties = data?.duties || []
  const matches = data?.matches || []
  const players = data?.players || []

  function invalidateAll(): void {
    queryClient.invalidateQueries({ queryKey: ['adminUmpire', activeTeam?.id] })
    queryClient.invalidateQueries({ queryKey: ['umpire', activeTeam?.id] })
    queryClient.invalidateQueries({ queryKey: ['umpireNext', activeTeam?.id] })
  }

  const assignMutation = useMutation<void, Error, { dutyId: string; playerId: string }>({
    mutationFn: async ({ dutyId, playerId }: { dutyId: string; playerId: string }): Promise<void> => {
      await supabase.from('umpire_duties')
        .update({ player_id: playerId || null })
        .eq('id', dutyId)
    },
    onSuccess: invalidateAll,
  })

  const deleteMutation = useMutation<void, Error, string[]>({
    mutationFn: async (dutyIds: string[]): Promise<void> => {
      await supabase.from('umpire_duties').delete().in('id', dutyIds)
    },
    onSuccess: invalidateAll,
  })

  async function generateDuties(): Promise<void> {
    setGenerating(true)
    setGenResult('')

    const homeMatches = matches.filter(m => m.is_home)
    if (!homeMatches.length) {
      setGenResult('Geen thuiswedstrijden gevonden.')
      setGenerating(false)
      return
    }

    let created = 0
    for (const match of homeMatches) {
      const existing = duties.filter(d => d.match_id === match.id)
      const needed = 2 - existing.length
      if (needed <= 0) continue

      const dutyDate = dutyDateFor(match.match_date, teamSettings.fluitbeurten_day_of_week, teamSettings.fluitbeurten_relative_to_match)
      const dayName = teamSettings.fluitbeurten_relative_to_match === 'match_day'
        ? 'wedstrijddag'
        : DAY_NAMES_NL[teamSettings.fluitbeurten_day_of_week]
      const desc = `Fluitbeurt ${dayName} ${format(dutyDate, 'd MMM', { locale: nl })}`

      const inserts = Array.from({ length: needed }, () => ({
        team_id: activeTeam!.id,
        match_id: match.id,
        player_id: null,
        umpire_match_desc: desc,
        status: 'assigned',
      }))

      const { error } = await supabase.from('umpire_duties').insert(inserts)
      if (!error) created += needed
    }

    setGenResult(created > 0 ? `${created} fluitbeurt${created > 1 ? 'en' : ''} aangemaakt.` : 'Alle thuiswedstrijden hebben al 2 fluitbeurten.')
    setGenerating(false)
    invalidateAll()
  }

  async function createManualDuty(): Promise<void> {
    if (!manualDate || !manualDesc.trim() || !activeTeam) return
    setManualSaving(true)
    setManualError('')

    const inserts = [
      { team_id: activeTeam.id, match_id: null, duty_date: manualDate, umpire_match_desc: manualDesc.trim(), player_id: manualPlayer1 || null, status: 'assigned' },
      { team_id: activeTeam.id, match_id: null, duty_date: manualDate, umpire_match_desc: manualDesc.trim(), player_id: manualPlayer2 || null, status: 'assigned' },
    ]
    const { error } = await supabase.from('umpire_duties').insert(inserts)

    setManualSaving(false)
    if (error) {
      setManualError(error.message)
      return
    }
    setManualDesc('')
    setManualPlayer1('')
    setManualPlayer2('')
    setShowManualForm(false)
    invalidateAll()
  }

  async function assignPlayer(dutyId: string, playerId: string): Promise<void> {
    await assignMutation.mutateAsync({ dutyId, playerId })
  }

  /** Removes a single slot. Deleting is irreversible, hence the confirm. */
  async function deleteDuty(dutyId: string): Promise<void> {
    if (!window.confirm('Deze fluitbeurt-plek verwijderen?')) return
    await deleteMutation.mutateAsync([dutyId])
  }

  /** Removes a whole duty — both slots at once, so it takes one action instead of two. */
  async function deleteGroup(group: UmpireGroup): Promise<void> {
    const label = group.match
      ? `de fluitbeurt bij ${opponentName(group.match.opponent)}`
      : group.duties[0]?.umpire_match_desc || 'deze fluitbeurt'
    const assigned = group.duties.filter(d => d.player_id).length
    const warning = assigned > 0
      ? ` ${assigned} toegewezen ${assigned === 1 ? 'speler wordt' : 'spelers worden'} losgekoppeld.`
      : ''
    if (!window.confirm(`Weet je zeker dat je ${label} helemaal verwijdert?${warning}`)) return
    await deleteMutation.mutateAsync(group.duties.map(d => d.id))
  }

  const today = new Date().toISOString().split('T')[0]
  const { upcoming, past } = groupDuties(duties, today, teamSettings)
  const allGroups = [...upcoming, ...past]

  const playerName = (p: { profiles: Pick<Profile, 'full_name' | 'nickname'> | null }): string =>
    p?.profiles?.nickname || p?.profiles?.full_name?.split(' ')[0] || '?'

  const timingLabel = teamSettings.fluitbeurten_relative_to_match === 'match_day'
    ? 'op de wedstrijddag zelf'
    : `${DAY_NAMES_NL[teamSettings.fluitbeurten_day_of_week]} ${teamSettings.fluitbeurten_relative_to_match === 'before' ? 'ervoor' : 'erna'}`

  // De UI verbergt dit tabblad al (BottomNav/More.tsx), maar deze pagina is direct
  // bereikbaar via /admin/umpire — laat een nette melding zien i.p.v. een redirect,
  // want de pagina is toch al alleen-admin.
  if (!teamSettings.fluitbeurten_enabled) {
    return (
      <div className="p-4 space-y-4 pb-8">
        <div className="flex items-center gap-3 pt-2">
          <Link to="/admin" className="text-text-muted hover:text-text">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">Fluitbeurten</h1>
        </div>
        <EmptyState icon={Flag}>
          Fluitbeurten staat uit voor dit team. Zet het aan via Team-instellingen om deze pagina te gebruiken.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Fluitbeurten</h1>
      </div>

      {/* Genereer knop — alleen in 'auto'-modus. Losse fluitbeurt toevoegen blijft in
          beide standen zichtbaar; dat is en blijft het handmatige vangnet. */}
      <div className="rounded-xl p-4 border space-y-2 bg-surface border-border">
        {teamSettings.fluitbeurten_mode === 'auto' && (
          <p className="text-sm text-text-muted">
            Genereert 2 open slots voor elke aankomende thuiswedstrijd ({timingLabel}).
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {teamSettings.fluitbeurten_mode === 'auto' && (
            <button
              onClick={generateDuties}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors bg-secondary text-secondary-text"
            >
              <Wand2 size={16} />
              {generating ? 'Genereren...' : 'Genereer fluitbeurten'}
            </button>
          )}
          <button
            onClick={() => setShowManualForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-border text-text hover:border-border-hover"
          >
            <Plus size={16} />
            Losse fluitbeurt toevoegen
          </button>
        </div>
        {genResult && <p className="text-xs text-success">{genResult}</p>}
      </div>

      {/* Losse fluitbeurt formulier */}
      {showManualForm && (
        <div className="rounded-xl p-4 border space-y-3 bg-surface border-border">
          <div>
            <label className="block text-xs text-text-muted mb-1">Datum</label>
            <input
              type="date"
              value={manualDate}
              onChange={e => setManualDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-surface-2 text-text"
              style={{ border: '1px solid var(--color-border)' }}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Omschrijving</label>
            <input
              type="text"
              value={manualDesc}
              onChange={e => setManualDesc(e.target.value)}
              placeholder="Bijv. Fluitbeurt bekerwedstrijd"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-surface-2 text-text"
              style={{ border: '1px solid var(--color-border)' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[[manualPlayer1, setManualPlayer1], [manualPlayer2, setManualPlayer2]].map(([value, setValue], i) => (
              <div key={i}>
                <label className="block text-xs text-text-muted mb-1">Speler {i + 1}</label>
                <select
                  value={value as string}
                  onChange={e => (setValue as (v: string) => void)(e.target.value)}
                  className="w-full px-2 py-2 rounded-lg text-sm outline-none bg-surface-2 text-text"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  <option value="">— open slot —</option>
                  {players.map(p => (
                    <option key={p.player_id} value={p.player_id}>{playerName(p)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {manualError && <p className="text-xs text-danger">{manualError}</p>}
          <div className="flex gap-2">
            <button
              onClick={createManualDuty}
              disabled={manualSaving || !manualDate || !manualDesc.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors bg-secondary text-secondary-text"
            >
              {manualSaving ? 'Bezig...' : 'Toevoegen'}
            </button>
            <button
              onClick={() => setShowManualForm(false)}
              className="px-4 py-2.5 rounded-xl text-sm text-text-muted"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Fluitbeurten, gegroepeerd per wedstrijd of losse datum */}
      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : allGroups.length === 0 ? (
        <EmptyState icon={Flag}>Nog geen fluitbeurten. Klik op "Genereer" of "Losse fluitbeurt toevoegen" hierboven.</EmptyState>
      ) : (
        <div className="space-y-3">
          {allGroups.map((group, gi) => {
            const { match, duties: slotDuties, umpireDate } = group
            return (
              <div key={match?.id || `manual-${gi}`} className="rounded-xl border overflow-hidden bg-surface border-border">
                {/* Groepsheader */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">
                      {match ? `Thuis vs ${opponentName(match.opponent)}` : slotDuties[0]?.umpire_match_desc}
                    </p>
                    <p className="text-xs text-text-muted">
                      {match
                        ? `${formatDate(match.match_date)} · fluiten ${umpireDate ? format(umpireDate, 'EEEE d MMM', { locale: nl }) : '?'}`
                        : umpireDate ? format(umpireDate, 'EEEE d MMM', { locale: nl }) : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      slotDuties.every(d => d.player_id)
                        ? 'bg-available/20 text-success'
                        : 'bg-secondary/20 text-secondary-soft'
                    }`}>
                      {slotDuties.filter(d => d.player_id).length}/{slotDuties.length} toegewezen
                    </span>
                    <button
                      onClick={() => deleteGroup(group)}
                      title="Hele fluitbeurt verwijderen"
                      aria-label="Hele fluitbeurt verwijderen"
                      className="text-text-faint hover:text-danger transition-colors p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Duty slots */}
                {slotDuties.map((duty, i) => (
                  <div key={duty.id}
                       className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-surface-2 text-text-muted">
                      {i + 1}
                    </div>
                    <select
                      value={duty.player_id || ''}
                      onChange={e => assignPlayer(duty.id, e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg text-sm outline-none bg-surface-2 text-text"
                      style={{ border: '1px solid var(--color-border)' }}
                    >
                      <option value="">— open slot —</option>
                      {players.map(p => (
                        <option key={p.player_id} value={p.player_id}>
                          {playerName(p)}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => deleteDuty(duty.id)}
                            className="text-text-faint hover:text-danger transition-colors p-1 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
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

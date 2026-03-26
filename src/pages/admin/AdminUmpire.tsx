import React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Flag, Wand2, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { formatDate } from '../../lib/utils'
import { parseISO, subDays, format } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { Profile } from '../../types/app'

interface UmpireDutyItem {
  id: string
  match_id: string | null
  player_id: string | null
  umpire_match_desc: string | null
  notes: string | null
  status: string | null
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

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
  duties: UmpireDutyItem[]
  matches: MatchItem[]
  players: PlayerItem[]
}

function saturdayBefore(matchDate: string | Date): Date {
  // Onze wedstrijden zijn op zondag → zaterdag ervoor = matchDate - 1 dag
  const d = typeof matchDate === 'string' ? parseISO(matchDate) : matchDate
  return subDays(d, 1)
}

export default function AdminUmpire(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const queryClient = useQueryClient()
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState('')

  const { data, isLoading } = useQuery<UmpireQueryData>({
    queryKey: ['adminUmpire', activeTeam?.id],
    queryFn: async (): Promise<UmpireQueryData> => {
      const today = new Date().toISOString().split('T')[0]

      const [dutiesRes, matchesRes, playersRes] = await Promise.all([
        supabase.from('umpire_duties')
          .select('id, match_id, player_id, umpire_match_desc, notes, status, profiles(full_name, nickname)')
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
        duties: (dutiesRes.data as unknown as UmpireDutyItem[]) || [],
        matches: (matchesRes.data as MatchItem[]) || [],
        players: (playersRes.data as unknown as PlayerItem[]) || [],
      }
    },
    enabled: !!activeTeam?.id,
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

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (dutyId: string): Promise<void> => {
      await supabase.from('umpire_duties').delete().eq('id', dutyId)
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

      const sat = saturdayBefore(match.match_date)
      const desc = `Fluitbeurt zaterdag ${format(sat, 'd MMM', { locale: nl })}`

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

  async function assignPlayer(dutyId: string, playerId: string): Promise<void> {
    await assignMutation.mutateAsync({ dutyId, playerId })
  }

  async function deleteDuty(dutyId: string): Promise<void> {
    await deleteMutation.mutateAsync(dutyId)
  }

  // Groepeer duties per match
  const grouped = matches.map(match => ({
    match,
    duties: duties.filter(d => d.match_id === match.id),
  })).filter(g => g.duties.length > 0)

  // Duties zonder match_id (handmatig aangemaakt)
  const orphans = duties.filter(d => !d.match_id)

  const playerName = (p: PlayerItem): string =>
    p?.profiles?.nickname || p?.profiles?.full_name?.split(' ')[0] || '?'

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Fluitbeurten</h1>
      </div>

      {/* Genereer knop */}
      <div className="rounded-xl p-4 border space-y-2 bg-surface border-border">
        <p className="text-sm text-slate-400">
          Genereert 2 open slots voor elke aankomende thuiswedstrijd (zaterdag ervoor).
        </p>
        <button
          onClick={generateDuties}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors bg-secondary text-secondary-text"
        >
          <Wand2 size={16} />
          {generating ? 'Genereren...' : 'Genereer fluitbeurten'}
        </button>
        {genResult && <p className="text-xs text-green-400">{genResult}</p>}
      </div>

      {/* Per match: open slots + toewijzing */}
      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : grouped.length === 0 && orphans.length === 0 ? (
        <EmptyState icon={Flag}>Nog geen fluitbeurten. Klik op "Genereer" hierboven.</EmptyState>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ match, duties: matchDuties }) => {
            const sat = saturdayBefore(match.match_date)
            return (
              <div key={match.id} className="rounded-xl border overflow-hidden bg-surface border-border">
                {/* Match header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Thuis vs {match.opponent}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(match.match_date)} · fluiten zaterdag {format(sat, 'd MMM', { locale: nl })}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    matchDuties.every(d => d.player_id)
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {matchDuties.filter(d => d.player_id).length}/{matchDuties.length} toegewezen
                  </span>
                </div>

                {/* Duty slots */}
                {matchDuties.map((duty, i) => (
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
                            className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-shrink-0">
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

import { useState } from 'react'
import { BarChart2, ChevronDown, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import { supabase } from '../lib/supabase'
import useTeamStore from '../stores/useTeamStore'
import { formatDate } from '../lib/utils'
import type { PlayerStats } from '../types/app'

interface GoalMatchBreakdown {
  match: {
    id: string
    opponent: string
    match_date: string
    is_home: boolean
    score_home: number | null
    score_away: number | null
  }
  goals: number
  assists: number
  cornerGoals: number
  penaltyGoals: number
}

interface StatsData {
  stats: PlayerStats[]
  goalMap: Record<string, GoalMatchBreakdown[]>
  totalGoals: number
  totalCornerGoals: number
}

interface RawGoalRow {
  scorer_id: string | null
  assist_id: string | null
  is_own_goal: boolean
  is_penalty: boolean
  is_penalty_corner: boolean
  minute: number | null
  match: {
    id: string
    opponent: string
    match_date: string
    is_home: boolean
    score_home: number | null
    score_away: number | null
  } | null
}

export default function Stats() {
  const { activeTeam } = useTeamStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ['stats', activeTeam?.id],
    queryFn: async (): Promise<StatsData> => {
      const [statsRes, goalsRes] = await Promise.all([
        supabase
          .from('v_player_stats')
          .select('*')
          .eq('team_id', activeTeam!.id)
          .order('goals', { ascending: false }),
        supabase
          .from('goals')
          .select('scorer_id, assist_id, is_own_goal, is_penalty, is_penalty_corner, minute, match:matches!goals_match_id_fkey(id, opponent, match_date, is_home, score_home, score_away)')
          .eq('matches.team_id', activeTeam!.id)
          .not('match', 'is', null),
      ])

      const stats = (statsRes.data || []) as unknown as PlayerStats[]
      const rawGoals = (goalsRes.data || []) as unknown as RawGoalRow[]

      // Team-wide totals
      let totalGoals = 0
      let totalCornerGoals = 0
      for (const g of rawGoals) {
        if (g.is_own_goal) continue
        totalGoals++
        if (g.is_penalty_corner) totalCornerGoals++
      }

      // Build per-player breakdown: group goals by player → match
      const map: Record<string, Record<string, GoalMatchBreakdown>> = {}
      for (const g of rawGoals) {
        if (!g.match) continue
        const mid = g.match.id

        if (!g.is_own_goal && g.scorer_id) {
          const pid = g.scorer_id
          if (!map[pid]) map[pid] = {}
          if (!map[pid][mid]) map[pid][mid] = { match: g.match, goals: 0, assists: 0, cornerGoals: 0, penaltyGoals: 0 }
          map[pid][mid].goals++
          if (g.is_penalty_corner) map[pid][mid].cornerGoals++
          if (g.is_penalty) map[pid][mid].penaltyGoals++
        }

        if (g.assist_id) {
          const pid = g.assist_id
          if (!map[pid]) map[pid] = {}
          if (!map[pid][mid]) map[pid][mid] = { match: g.match, goals: 0, assists: 0, cornerGoals: 0, penaltyGoals: 0 }
          map[pid][mid].assists++
        }
      }

      // Convert per-player maps to sorted arrays
      const goalMap: Record<string, GoalMatchBreakdown[]> = {}
      for (const [pid, matches] of Object.entries(map)) {
        goalMap[pid] = Object.values(matches).sort(
          (a, b) => new Date(a.match.match_date).getTime() - new Date(b.match.match_date).getTime()
        )
      }

      return { stats, goalMap, totalGoals, totalCornerGoals }
    },
    enabled: !!activeTeam?.id,
  })

  const stats = data?.stats || []
  const goalMap = data?.goalMap || {}
  const totalGoals = data?.totalGoals ?? 0
  const totalCornerGoals = data?.totalCornerGoals ?? 0

  const topscorers = [...stats]
    .filter(p => (p.goals ?? 0) > 0)
    .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))
    .slice(0, 3)
    .map(p => ({ name: p.full_name, value: p.goals ?? 0 }))

  const mvps = [...stats]
    .filter(p => (p.goals ?? 0) + (p.assists ?? 0) > 0)
    .sort((a, b) => ((b.goals ?? 0) + (b.assists ?? 0)) - ((a.goals ?? 0) + (a.assists ?? 0)))
    .slice(0, 3)
    .map(p => ({ name: p.full_name, value: (p.goals ?? 0) + (p.assists ?? 0) }))

  function toggle(playerId: string) {
    setExpanded(prev => ({ ...prev, [playerId]: !prev[playerId] }))
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Statistieken</h1>

      {isLoading ? (
        <PageLoader />
      ) : stats.length === 0 ? (
        <EmptyState icon={BarChart2}>Nog geen statistieken beschikbaar</EmptyState>
      ) : (
        <>
          {/* Totaaloverzicht */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-4 text-center bg-surface border-border">
              <p className="text-2xl font-bold">{totalGoals}</p>
              <p className="text-xs mt-1 text-text-muted">Totaal doelpunten</p>
            </div>
            <div className="rounded-xl border p-4 text-center bg-surface border-border">
              <p className="text-2xl font-bold">{totalCornerGoals}</p>
              <p className="text-xs mt-1 text-text-muted">Waarvan uit corner</p>
            </div>
          </div>

          <MiniPodium title="🏑 Topscorer" entries={topscorers} statSuffix="doelpunten" />
          <MiniPodium title="⭐ MVP" entries={mvps} statSuffix="goals + assists" />

          {/* Spelerslijst */}
          <div className="rounded-xl border overflow-hidden bg-surface border-border">
            {/* Header */}
            <div className="px-4 py-3 border-b flex text-xs font-medium text-slate-400 uppercase tracking-wide border-border">
              <span className="flex-1">Speler</span>
              <span className="w-10 text-center">Gesp.</span>
              <span className="w-10 text-center">Uitg.</span>
              <span className="w-10 text-center">Doelp.</span>
              <span className="w-10 text-center">Ass.</span>
            </div>

            {stats.map((player) => {
              const hasDetail = ((player.goals ?? 0) > 0 || (player.assists ?? 0) > 0) && goalMap[player.player_id]?.length > 0
              const isOpen = expanded[player.player_id]

              return (
                <div key={player.player_id} className="border-b last:border-0 border-border">
                  {/* Player row */}
                  <div
                    className={`flex items-center px-4 py-3 text-sm ${hasDetail ? 'cursor-pointer select-none' : ''}`}
                    onClick={hasDetail ? () => toggle(player.player_id) : undefined}
                  >
                    {/* Expand icon */}
                    <span className="w-4 mr-2 flex-shrink-0 text-slate-500">
                      {hasDetail
                        ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
                        : null}
                    </span>
                    <span className="flex-1 font-medium truncate">{player.full_name}</span>
                    <span className="w-10 text-center text-slate-300">{player.matches_played || 0}</span>
                    <span className="w-10 text-center text-slate-500">{player.times_rostered_off || 0}</span>
                    <span className="w-10 text-center font-semibold"
                          style={{ color: (player.goals ?? 0) > 0 ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                      {player.goals || 0}
                    </span>
                    <span className="w-10 text-center text-slate-300">{player.assists || 0}</span>
                  </div>

                  {/* Expandable goal/assist breakdown, incl. corner/strafbal */}
                  {hasDetail && isOpen && (
                    <div className="pb-2 pt-0 bg-surface-2">
                      {goalMap[player.player_id].map(({ match, goals, assists, cornerGoals, penaltyGoals }) => {
                        const ourScore = match.is_home ? match.score_home : match.score_away
                        const theirScore = match.is_home ? match.score_away : match.score_home
                        const hasScore = ourScore != null && theirScore != null
                        const goalTypeParts = [
                          cornerGoals > 0 ? `${cornerGoals}x corner` : null,
                          penaltyGoals > 0 ? `${penaltyGoals}x strafbal` : null,
                        ].filter(Boolean)
                        return (
                          <div key={match.id}
                               className="flex items-center gap-2 px-6 py-1.5 text-xs text-text-muted">
                            <span className="w-20 flex-shrink-0">{formatDate(match.match_date)}</span>
                            <span className="flex-1 truncate">
                              {match.is_home ? 'Thuis' : 'Uit'} vs {match.opponent.replace(/ Heren.*/, '')}
                              {goalTypeParts.length > 0 && (
                                <span className="opacity-70"> ({goalTypeParts.join(', ')})</span>
                              )}
                            </span>
                            {hasScore && (
                              <span className="flex-shrink-0 text-slate-400">
                                {ourScore}–{theirScore}
                              </span>
                            )}
                            <span className="flex-shrink-0 font-semibold text-secondary"
                                  style={{ minWidth: '3rem', textAlign: 'right' }}>
                              {goals > 0 && `${goals} goal${goals > 1 ? 's' : ''}`}
                              {goals > 0 && assists > 0 && ' · '}
                              {assists > 0 && `${assists} ass.`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MiniPodiumProps {
  title: string
  entries: { name: string; value: number }[]
  statSuffix: string
}

function MiniPodium({ title, entries, statSuffix }: MiniPodiumProps) {
  if (entries.length === 0) return null
  const medals = ['🥇', '🥈', '🥉']
  const order = ['order-2', 'order-1', 'order-3']

  return (
    <div className="rounded-xl border p-4 bg-surface border-border">
      <h2 className="text-sm font-semibold text-text-muted mb-3">{title}</h2>
      <div className="flex items-end justify-center gap-2">
        {entries.map((entry, i) => (
          <div key={entry.name} className={`flex flex-col items-center flex-1 max-w-[7rem] ${order[i]}`}>
            <span className="text-2xl mb-1">{medals[i]}</span>
            <div
              className={`w-full rounded-xl flex flex-col items-center justify-center px-2 ${
                i === 0 ? 'py-4 border' : 'py-3 border'
              }`}
              style={{
                backgroundColor: i === 0 ? 'rgba(245,158,11,0.1)' : 'var(--color-surface-2)',
                borderColor: i === 0 ? 'rgba(245,158,11,0.3)' : 'var(--color-border)',
              }}
            >
              <p className="text-sm font-semibold truncate w-full text-center">{entry.name}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--color-secondary)' }}>{entry.value}</p>
              <p className="text-[10px] text-text-muted text-center leading-tight">{statSuffix}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

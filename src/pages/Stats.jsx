import { useEffect, useState } from 'react'
import { BarChart2, ChevronDown, ChevronRight } from 'lucide-react'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import { supabase } from '../lib/supabase'
import useTeamStore from '../stores/useTeamStore'
import { formatDate } from '../lib/utils'

export default function Stats() {
  const { activeTeam } = useTeamStore()
  const [stats, setStats] = useState([])
  const [goalMap, setGoalMap] = useState({})   // player_id → [{match, goals, assists}]
  const [expanded, setExpanded] = useState({}) // player_id → bool
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeam?.id) return

    Promise.all([
      supabase
        .from('v_player_stats')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('goals', { ascending: false }),
      supabase
        .from('goals')
        .select('scorer_id, assist_id, is_own_goal, minute, match:matches!goals_match_id_fkey(id, opponent, match_date, is_home, score_home, score_away)')
        .eq('matches.team_id', activeTeam.id)
        .not('match', 'is', null),
    ]).then(([statsRes, goalsRes]) => {
      setStats(statsRes.data || [])

      // Build per-player breakdown: group goals by player → match
      const map = {}
      for (const g of (goalsRes.data || [])) {
        if (!g.match) continue

        const addToPlayer = (pid, type) => {
          if (!pid) return
          if (!map[pid]) map[pid] = {}
          const mid = g.match.id
          if (!map[pid][mid]) map[pid][mid] = { match: g.match, goals: 0, assists: 0 }
          if (type === 'goal') map[pid][mid].goals++
          if (type === 'assist') map[pid][mid].assists++
        }

        if (!g.is_own_goal) addToPlayer(g.scorer_id, 'goal')
        addToPlayer(g.assist_id, 'assist')
      }

      // Convert per-player maps to sorted arrays
      const sorted = {}
      for (const [pid, matches] of Object.entries(map)) {
        sorted[pid] = Object.values(matches).sort(
          (a, b) => new Date(a.match.match_date) - new Date(b.match.match_date)
        )
      }
      setGoalMap(sorted)
      setLoading(false)
    })
  }, [activeTeam?.id])

  function toggle(playerId) {
    setExpanded(prev => ({ ...prev, [playerId]: !prev[playerId] }))
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Statistieken</h1>

      {loading ? (
        <PageLoader />
      ) : stats.length === 0 ? (
        <EmptyState icon={BarChart2}>Nog geen statistieken beschikbaar</EmptyState>
      ) : (
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
            const hasDetail = (player.goals > 0 || player.assists > 0) && goalMap[player.player_id]?.length > 0
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
                        style={{ color: player.goals > 0 ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                    {player.goals || 0}
                  </span>
                  <span className="w-10 text-center text-slate-300">{player.assists || 0}</span>
                </div>

                {/* Expandable goal/assist breakdown */}
                {hasDetail && isOpen && (
                  <div className="pb-2 pt-0 bg-surface-2">
                    {goalMap[player.player_id].map(({ match, goals, assists }) => {
                      const ourScore = match.is_home ? match.score_home : match.score_away
                      const theirScore = match.is_home ? match.score_away : match.score_home
                      const hasScore = ourScore != null && theirScore != null
                      return (
                        <div key={match.id}
                             className="flex items-center gap-2 px-6 py-1.5 text-xs text-text-muted">
                          <span className="w-20 flex-shrink-0">{formatDate(match.match_date)}</span>
                          <span className="flex-1 truncate">
                            {match.is_home ? 'Thuis' : 'Uit'} vs {match.opponent.replace(/ Heren.*/, '')}
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
      )}
    </div>
  )
}

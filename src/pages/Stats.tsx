import { useState } from 'react'
import { BarChart2, ChevronDown, ChevronRight } from 'lucide-react'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import StatsPodiums from '../components/ui/MiniPodium'
import useTeamStore from '../stores/useTeamStore'
import { formatDate } from '../lib/utils'
import { useTeamStats, topByGoals, topByGoalsPlusAssists } from '../lib/stats'

export default function Stats() {
  const { activeTeam } = useTeamStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { data, isLoading } = useTeamStats(activeTeam?.id)

  const players = data?.players || []
  const goalMap = data?.goalMap || {}
  const totalGoals = data?.totalGoals ?? 0
  const totalCornerGoals = data?.totalCornerGoals ?? 0

  const topscorers = topByGoals(players)
  const mvps = topByGoalsPlusAssists(players)

  function toggle(playerId: string) {
    setExpanded(prev => ({ ...prev, [playerId]: !prev[playerId] }))
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Statistieken</h1>

      {isLoading ? (
        <PageLoader />
      ) : players.length === 0 ? (
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

          <StatsPodiums topscorers={topscorers} mvps={mvps} />

          {/* Spelerslijst */}
          <div className="rounded-xl border overflow-hidden bg-surface border-border">
            {/* Header */}
            <div className="px-4 py-3 border-b flex text-xs font-medium text-slate-400 uppercase tracking-wide border-border">
              <span className="flex-1">Speler</span>
              <span className="w-9 text-center" title="Gespeeld">Gesp.</span>
              <span className="w-9 text-center" title="Velddoelpunt">VD</span>
              <span className="w-9 text-center" title="Strafcorner">SC</span>
              <span className="w-9 text-center" title="Strafbal">SB</span>
              <span className="w-11 text-center" title="Totaal doelpunten">Goals</span>
              <span className="w-9 text-center" title="Assist">Ass.</span>
            </div>

            {players.map((player) => {
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
                    <span className="w-9 text-center text-slate-300">{player.matches_played}</span>
                    <span className="w-9 text-center text-slate-300">{player.fieldGoals}</span>
                    <span className="w-9 text-center text-slate-300">{player.cornerGoals}</span>
                    <span className="w-9 text-center text-slate-300">{player.penaltyGoals}</span>
                    <span className="w-11 text-center font-semibold"
                          style={{ color: player.goals > 0 ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                      {player.goals}
                    </span>
                    <span className="w-9 text-center text-slate-300">{player.assists}</span>
                  </div>

                  {/* Expandable goal/assist breakdown, incl. VD/SC/SB */}
                  {hasDetail && isOpen && (
                    <div className="pb-2 pt-0 bg-surface-2">
                      {goalMap[player.player_id].map(({ match, goals, assists, fieldGoals, cornerGoals, penaltyGoals }) => {
                        const ourScore = match.is_home ? match.score_home : match.score_away
                        const theirScore = match.is_home ? match.score_away : match.score_home
                        const hasScore = ourScore != null && theirScore != null
                        const goalTypeParts = [
                          fieldGoals > 0 ? `${fieldGoals}x VD` : null,
                          cornerGoals > 0 ? `${cornerGoals}x SC` : null,
                          penaltyGoals > 0 ? `${penaltyGoals}x SB` : null,
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

          <p className="text-[11px] text-text-muted px-1 leading-relaxed">
            VD = velddoelpunt, SC = doelpunt uit strafcorner, SB = doelpunt uit strafbal
          </p>
        </>
      )}
    </div>
  )
}

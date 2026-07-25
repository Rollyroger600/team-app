import { Trophy } from 'lucide-react'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import { PodiumCard } from '../components/ui/MiniPodium'
import useTeamStore from '../stores/useTeamStore'
import { usePotjescupStats, topByPoints } from '../lib/potjescup'

function formatPoints(points: number): string {
  return points % 1 === 0 ? String(points) : points.toFixed(1)
}

export default function Potjescup() {
  const { activeTeam } = useTeamStore()
  const { data: players = [], isLoading } = usePotjescupStats(activeTeam?.id)

  const top3 = topByPoints(players)

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Potjescup</h1>

      {isLoading ? (
        <PageLoader />
      ) : players.length === 0 ? (
        <EmptyState icon={Trophy}>Nog geen trainingspotjes geregistreerd</EmptyState>
      ) : (
        <>
          <PodiumCard sections={[{ title: '🏆 Potjescup', statLabel: 'punten', entries: top3 }]} />

          <div className="rounded-xl border overflow-hidden bg-surface border-border">
            <div className="px-4 py-3 border-b flex text-xs font-medium text-slate-400 uppercase tracking-wide border-border">
              <span className="flex-1">Speler</span>
              <span className="w-16 text-center" title="Trainingspotjes met punten">Potjes</span>
              <span className="w-14 text-center" title="Totaal punten">Punten</span>
            </div>

            {players.map((player, i) => (
              <div key={player.player_id}
                   className="flex items-center px-4 py-3 text-sm border-b last:border-0 border-border">
                <span className="w-5 flex-shrink-0 text-text-muted">{i + 1}</span>
                <span className="flex-1 font-medium truncate">{player.full_name}</span>
                <span className="w-16 text-center text-slate-300">{player.sessionsPlayed}</span>
                <span className="w-14 text-center font-semibold"
                      style={{ color: player.totalPoints > 0 ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                  {formatPoints(player.totalPoints)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-text-muted px-1 leading-relaxed">
            Elke training telt de winnende eindpartij 1 punt; bij een wissel halverwege telt een half punt.
          </p>
        </>
      )}
    </div>
  )
}

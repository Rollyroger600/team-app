import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Plus, Info, X } from 'lucide-react'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import { PodiumCard } from '../components/ui/MiniPodium'
import useTeamStore from '../stores/useTeamStore'
import useAuthStore from '../stores/useAuthStore'
import { usePotjescupStats, topByPoints } from '../lib/potjescup'

function formatPoints(points: number): string {
  return points % 1 === 0 ? String(points) : points.toFixed(1)
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border p-4 space-y-3 bg-surface border-border max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold">Spelregels Potjescup</p>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="text-sm text-text-muted space-y-3 leading-relaxed">
          <p>
            Elke woensdag voorafgaand aan een competitiewedstrijd wordt er op de training
            gespeeld voor de potjescup. Tijdens de eindpartij zijn hiervoor punten te verdienen.
            Winnende team krijgt 1 punt, verliezende team 0. Winnende team moet er zelf voor
            zorgen dat dezelfde avond er een foto in de team whatsapp staat met de winnaars.
          </p>
          <p>
            Ter verduidelijking er zijn dus 22 kansen om punten te verdienen voor de potjescup.
            Alleen de woensdagen vóór competitiewedstrijden.
          </p>
          <p>*Minimaal aantal spelers aanwezig is 10.</p>
          <p>**Mocht er een speler halverwege de wedstrijd moeten wisselen van team dan krijgt deze speler 0,5 punt.</p>
        </div>
      </div>
    </div>
  )
}

export default function Potjescup() {
  const { activeTeam } = useTeamStore()
  const { isAnyTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isAnyTeamAdmin() || isPlatformAdmin()
  const { data: players = [], isLoading } = usePotjescupStats(activeTeam?.id)
  const [showRules, setShowRules] = useState(false)

  const top3 = topByPoints(players)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold">Potjescup</h1>
          <button
            onClick={() => setShowRules(true)}
            className="text-text-muted hover:text-text p-1"
            title="Spelregels"
          >
            <Info size={18} />
          </button>
        </div>
        {isAdmin && (
          <Link
            to="/admin/potjescup"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-secondary-text"
          >
            <Plus size={14} />
            Score toevoegen
          </Link>
        )}
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {isLoading ? (
        <PageLoader />
      ) : players.length === 0 ? (
        <EmptyState icon={Trophy}>Nog geen trainingspotjes geregistreerd</EmptyState>
      ) : (
        <>
          <PodiumCard sections={[{ title: '🏆 Potjescup', statLabel: 'punten', entries: top3 }]} />

          <div className="rounded-xl border overflow-hidden bg-surface border-border">
            <div className="px-4 py-3 border-b flex text-xs font-medium text-text-muted uppercase tracking-wide border-border">
              <span className="flex-1">Speler</span>
              <span className="w-16 text-center" title="Trainingspotjes met punten">Potjes</span>
              <span className="w-14 text-center" title="Totaal punten">Punten</span>
            </div>

            {players.map((player, i) => (
              <div key={player.player_id}
                   className="flex items-center px-4 py-3 text-sm border-b last:border-0 border-border">
                <span className="w-5 flex-shrink-0 text-text-muted">{i + 1}</span>
                <span className="flex-1 font-medium truncate">{player.full_name}</span>
                <span className="w-16 text-center text-text-soft">{player.sessionsPlayed}</span>
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

import { useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Plus, Info, X, ChevronDown } from 'lucide-react'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import { PodiumCard } from '../components/ui/MiniPodium'
import useTeamStore from '../stores/useTeamStore'
import useAuthStore from '../stores/useAuthStore'
import { formatDate } from '../lib/utils'
import { usePotjescupStats, usePotjescupHistory, topByPoints, MIN_SESSIONS_FOR_CHART, DEFAULT_POTJESCUP_RULES } from '../lib/potjescup'
import type { PotjescupSession } from '../lib/potjescup'

// recharts weegt ~100 kB gzip — te veel om standaard mee te sturen op een telefoon-PWA.
// Pas ophalen zodra er echt een grafiek te tonen is (vanaf MIN_SESSIONS_FOR_CHART trainingen).
const PotjescupChart = lazy(() => import('../components/ui/PotjescupChart'))

function formatPoints(points: number): string {
  return points % 1 === 0 ? String(points) : points.toFixed(1)
}

function RulesModal({ onClose, rulesText }: { onClose: () => void; rulesText: string | null }) {
  // Alinea's gescheiden door een lege regel — zie CLAUDE.md Potjescup-sectie.
  const paragraphs = rulesText
    ? rulesText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    : DEFAULT_POTJESCUP_RULES

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
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
    </div>
  )
}

/** Eén training in het logboek: datum + wie er punten pakten. */
function HistoryRow({ session }: { session: PotjescupSession }) {
  const [open, setOpen] = useState(false)
  const total = session.scorers.reduce((sum, s) => sum + s.points, 0)

  return (
    <div className="border-b last:border-0 border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left hover:bg-surface-2 transition-colors"
      >
        <span className="flex-1 font-medium">{formatDate(session.session_date)}</span>
        <span className="text-xs text-text-muted">
          {session.scorers.length === 0
            ? 'geen punten'
            : `${session.scorers.length} spelers · ${formatPoints(total)} pnt`}
        </span>
        <ChevronDown
          size={15}
          className={`text-text-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-3">
          {session.scorers.length === 0 ? (
            <p className="text-xs text-text-muted">Niemand kreeg punten voor deze training.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {session.scorers.map(s => (
                <span
                  key={s.player_id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-surface-2 text-text-soft"
                >
                  {s.full_name}
                  <span className="font-semibold text-secondary-soft">{formatPoints(s.points)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Potjescup() {
  const { activeTeam, teamSettings } = useTeamStore()
  const { isAnyTeamAdmin, isPlatformAdmin, profile } = useAuthStore()
  const isAdmin = isAnyTeamAdmin() || isPlatformAdmin()
  const { data: players = [], isLoading } = usePotjescupStats(activeTeam?.id)
  const { data: history } = usePotjescupHistory(activeTeam?.id)
  const [showRules, setShowRules] = useState(false)

  const top3 = topByPoints(players)
  const sessions = history?.sessions || []
  const series = history?.series || []

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

      {showRules && <RulesModal onClose={() => setShowRules(false)} rulesText={teamSettings.potjescup_rules_text} />}

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

          {sessions.length >= MIN_SESSIONS_FOR_CHART && (
            <Suspense fallback={<div className="h-72 rounded-xl border bg-surface border-border animate-pulse" />}>
              <PotjescupChart series={series} ownPlayerId={profile?.id} />
            </Suspense>
          )}

          {sessions.length > 0 && (
            <div className="rounded-xl border overflow-hidden bg-surface border-border">
              <div className="px-4 py-3 border-b border-border flex items-baseline justify-between">
                <p className="text-sm font-semibold">Historie</p>
                <p className="text-xs text-text-muted">
                  {sessions.length} training{sessions.length === 1 ? '' : 'en'}
                  {sessions.length < MIN_SESSIONS_FOR_CHART && ' · grafiek na 3'}
                </p>
              </div>
              {sessions.map(session => (
                <HistoryRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

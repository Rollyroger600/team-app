import { formatDate } from '../../lib/utils'
import { subDays, parseISO, format } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { UmpireDutyWithJoins, UmpireGroup } from '../../types/app'

function dutyName(duty: UmpireDutyWithJoins): string | null {
  return duty.profiles?.nickname || duty.profiles?.full_name?.split(' ')[0] || null
}

interface UmpireCardProps {
  group: UmpireGroup
  userId: string
  past: boolean
}

// Accepts a group: { match, duties: [duty1, duty2], umpireDate }
// match may be null for orphan duties (no match_id)
export function UmpireCard({ group, userId, past }: UmpireCardProps) {
  const { match, duties, umpireDate } = group

  const satLabel = umpireDate
    ? format(umpireDate, 'EEEE d MMM', { locale: nl })
    : duties[0]?.umpire_match_desc || '?'

  const names = duties.map(d => {
    const n = dutyName(d)
    return n || <span className="italic text-slate-600">open</span>
  })

  const isOwn = duties.some(d => d.player_id === userId)

  // Build display: "Kevin & Wouter" or "Kevin & open"
  const nameDisplay = names.reduce<React.ReactNode[]>((acc, n, i) => {
    if (i === 0) return [n]
    return [...acc, <span key={`sep-${i}`} className="text-slate-500"> & </span>, n]
  }, [])

  return (
    <div
      className="p-4 rounded-xl border transition-all"
      style={{
        backgroundColor: past ? 'transparent' : isOwn ? 'rgba(245,158,11,0.08)' : 'var(--color-surface)',
        borderColor: past ? 'var(--color-border)' : isOwn ? 'rgba(245,158,11,0.4)' : 'var(--color-border)',
        opacity: past ? 0.5 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isOwn && !past && (
              <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                    style={{ backgroundColor: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                Jij
              </span>
            )}
            <p className={`font-semibold text-sm ${past ? 'text-slate-500' : ''}`}>
              {satLabel}
            </p>
          </div>
          {match && (
            <p className="text-xs text-slate-400">
              Bij thuiswedstrijd vs {match.opponent} ({formatDate(match.match_date)})
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <span className={`text-sm font-medium ${past ? 'text-slate-500' : isOwn ? 'text-amber-400' : 'text-slate-300'}`}>
            {nameDisplay}
          </span>
        </div>
      </div>
    </div>
  )
}

// Helper: convert flat duties array → grouped by match_id, sorted by umpire date
export function groupDuties(duties: UmpireDutyWithJoins[], today: string): { upcoming: UmpireGroup[]; past: UmpireGroup[] } {
  const groups: Record<string, UmpireGroup> = {}

  for (const d of duties) {
    const key = d.match_id || `orphan-${d.id}`
    if (!groups[key]) {
      const umpireDate = d.matches?.match_date
        ? subDays(parseISO(d.matches.match_date), 1)
        : null
      groups[key] = { match: d.matches || null, duties: [], umpireDate }
    }
    groups[key].duties.push(d)
  }

  const all = Object.values(groups)
  const isPastGroup = (g: UmpireGroup) => g.umpireDate && g.umpireDate.toISOString().split('T')[0] < today

  return {
    upcoming: all.filter(g => !isPastGroup(g)).sort((a, b) => {
      if (!a.umpireDate) return 1
      if (!b.umpireDate) return -1
      return a.umpireDate.getTime() - b.umpireDate.getTime()
    }),
    past: all.filter(g => isPastGroup(g)).sort((a, b) => {
      if (!b.umpireDate) return -1
      if (!a.umpireDate) return 1
      return b.umpireDate.getTime() - a.umpireDate.getTime()
    }),
  }
}

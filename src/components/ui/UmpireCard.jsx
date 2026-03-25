import { formatDate } from '../../lib/utils'
import { subDays, parseISO, format } from 'date-fns'
import { nl } from 'date-fns/locale'

export function UmpireCard({ duty, isOwn, past }) {
  const sat = duty.matches?.match_date
    ? format(subDays(parseISO(duty.matches.match_date), 1), 'EEEE d MMM', { locale: nl })
    : null

  const assignedName = duty.profiles?.nickname || duty.profiles?.full_name?.split(' ')[0]

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
              {sat || duty.umpire_match_desc}
            </p>
          </div>
          {duty.matches && (
            <p className="text-xs text-slate-400">
              Bij thuiswedstrijd vs {duty.matches.opponent} ({formatDate(duty.matches.match_date)})
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          {assignedName ? (
            <span className={`text-sm font-medium ${past ? 'text-slate-500' : isOwn ? 'text-amber-400' : 'text-slate-300'}`}>
              {assignedName}
            </span>
          ) : (
            <span className="text-xs text-slate-600 italic">Niet toegewezen</span>
          )}
        </div>
      </div>
      {duty.notes && (
        <p className="text-xs text-slate-400 mt-1.5">{duty.notes}</p>
      )}
    </div>
  )
}

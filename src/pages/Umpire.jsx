import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'
import { formatDate } from '../lib/utils'
import { parseISO, subDays, format, isPast } from 'date-fns'
import { nl } from 'date-fns/locale'

function UmpireCard({ duty, isOwn, past }) {
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

export default function Umpire() {
  const { user } = useAuthStore()
  const { activeTeam } = useTeamStore()
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeam?.id || !user?.id) return

    supabase
      .from('umpire_duties')
      .select('id, match_id, player_id, umpire_match_desc, notes, status, profiles(full_name, nickname), matches(match_date, opponent, is_home)')
      .eq('team_id', activeTeam.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        const all = data || []
        const today = new Date().toISOString().split('T')[0]

        // Spleet op zaterdag-datum (match_date - 1 dag)
        const withDate = all.map(d => ({
          ...d,
          umpire_date: d.matches?.match_date
            ? subDays(parseISO(d.matches.match_date), 1)
            : null,
        }))

        setUpcoming(withDate.filter(d => !d.umpire_date || !isPast(d.umpire_date) || d.umpire_date.toISOString().split('T')[0] >= today))
        setPast(withDate.filter(d => d.umpire_date && isPast(d.umpire_date) && d.umpire_date.toISOString().split('T')[0] < today).reverse())
        setLoading(false)
      })
  }, [activeTeam?.id, user?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
             style={{ borderColor: 'var(--color-secondary)' }} />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Fluitbeurten</h1>

      {upcoming.length === 0 && past.length === 0 ? (
        <div className="rounded-xl p-8 border text-center"
             style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <Flag size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">Geen fluitbeurten gepland</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              {upcoming.map(duty => (
                <UmpireCard
                  key={duty.id}
                  duty={duty}
                  isOwn={duty.player_id === user.id}
                  past={false}
                />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 pt-2">
                Gefloten
              </p>
              {past.map(duty => (
                <UmpireCard
                  key={duty.id}
                  duty={duty}
                  isOwn={duty.player_id === user.id}
                  past={true}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

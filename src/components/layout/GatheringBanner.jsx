import { useEffect, useState } from 'react'
import { Clock, Car } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatGatheringDisplay } from '../../lib/gathering'
import { formatDate, formatTime } from '../../lib/utils'
import useTeamStore from '../../stores/useTeamStore'

export default function GatheringBanner() {
  const { activeTeam, teamSettings } = useTeamStore()
  const [nextMatch, setNextMatch] = useState(null)

  useEffect(() => {
    if (!activeTeam?.id) return

    const today = new Date().toISOString().split('T')[0]
    supabase
      .from('matches')
      .select('*')
      .eq('team_id', activeTeam.id)
      .eq('status', 'upcoming')
      .gte('match_date', today)
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setNextMatch(data))
  }, [activeTeam?.id])

  if (!nextMatch) return null

  const gatheringInfo = formatGatheringDisplay(nextMatch, teamSettings)
  const dateStr = formatDate(nextMatch.match_date)
  const timeStr = formatTime(nextMatch.match_time)

  return (
    <div className="px-4 py-2.5 border-b text-sm"
         style={{ backgroundColor: 'var(--color-primary)', borderColor: 'rgba(255,255,255,0.1)' }}>
      <div className="max-w-lg mx-auto flex items-center gap-2 flex-wrap">
        <Clock size={14} className="flex-shrink-0 opacity-80" />
        <span className="font-semibold">{dateStr}</span>
        <span className="opacity-75">—</span>
        {gatheringInfo?.isNtb ? (
          <span className="opacity-75">vs {nextMatch.opponent} — Tijd NTB</span>
        ) : (
          <>
            <span className="font-bold text-amber-300">{gatheringInfo?.time}</span>
            <span className="opacity-75">{gatheringInfo?.label}</span>
            {!nextMatch.is_home && nextMatch.travel_duration_minutes && (
              <span className="flex items-center gap-1 opacity-75 ml-auto">
                <Car size={12} />
                {nextMatch.travel_duration_minutes} min rijden
              </span>
            )}
          </>
        )}
        <span className="ml-auto opacity-75 text-xs">
          {nextMatch.is_home ? 'Thuis' : 'Uit'} vs {nextMatch.opponent}
        </span>
      </div>
    </div>
  )
}

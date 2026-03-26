import { useQuery } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import { UmpireCard, groupDuties } from '../components/ui/UmpireCard'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'
import type { UmpireDutyWithJoins, UmpireGroup } from '../types/app'

interface UmpireQueryResult {
  upcoming: UmpireGroup[]
  past: UmpireGroup[]
}

export default function Umpire() {
  const { user } = useAuthStore()
  const { activeTeam } = useTeamStore()

  const { data, isLoading } = useQuery<UmpireQueryResult>({
    queryKey: ['umpire', activeTeam?.id],
    queryFn: async (): Promise<UmpireQueryResult> => {
      const { data } = await supabase
        .from('umpire_duties')
        .select('id, match_id, player_id, umpire_match_desc, notes, status, profiles(full_name, nickname), matches(id, match_date, opponent, is_home)')
        .eq('team_id', activeTeam!.id)
        .order('created_at', { ascending: true })

      const today = new Date().toISOString().split('T')[0]
      return groupDuties((data as unknown as UmpireDutyWithJoins[]) || [], today)
    },
    enabled: !!activeTeam?.id && !!user?.id,
  })

  const upcoming = data?.upcoming || []
  const past = data?.past || []

  if (isLoading) {
    return <PageLoader />
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Fluitbeurten</h1>

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState icon={Flag}>Geen fluitbeurten gepland</EmptyState>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              {upcoming.map((group, i) => (
                <UmpireCard key={group.match?.id || i} group={group} userId={user!.id} past={false} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 pt-2">
                Gefloten
              </p>
              {past.map((group, i) => (
                <UmpireCard key={group.match?.id || i} group={group} userId={user!.id} past={true} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

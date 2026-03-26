import { useQuery } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import useTeamStore from '../stores/useTeamStore'
import { formatDateLong } from '../lib/utils'

interface AnnouncementItem {
  id: string
  title: string | null
  body: string
  created_at: string | null
  profiles: { full_name: string | null } | null
}

export default function Announcements() {
  const { activeTeam } = useTeamStore()

  const { data: announcements = [], isLoading } = useQuery<AnnouncementItem[]>({
    queryKey: ['announcements', activeTeam?.id],
    queryFn: async (): Promise<AnnouncementItem[]> => {
      const { data } = await supabase
        .from('announcements')
        .select('*, profiles(full_name)')
        .eq('team_id', activeTeam!.id)
        .order('created_at', { ascending: false })
      return (data || []) as unknown as AnnouncementItem[]
    },
    enabled: !!activeTeam?.id,
  })

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Berichten</h1>

      {isLoading ? (
        <PageLoader />
      ) : announcements.length === 0 ? (
        <EmptyState icon={MessageSquare}>Geen berichten</EmptyState>
      ) : (
        <div className="space-y-3">
          {announcements.map((item) => (
            <div key={item.id}
                 className="rounded-xl p-4 border bg-surface border-border">
              {item.title && (
                <h2 className="font-semibold mb-1">{item.title}</h2>
              )}
              <p className="text-slate-300 text-sm whitespace-pre-wrap">{item.body}</p>
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>Door {item.profiles?.full_name || 'Onbekend'}</span>
                <span>{formatDateLong(item.created_at?.split('T')[0])}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

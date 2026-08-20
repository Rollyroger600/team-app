import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import useTeamStore from '../stores/useTeamStore'
import { useIsTeamAdmin } from '../lib/permissions'
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
  const isAdmin = useIsTeamAdmin()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

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

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      const { error: err } = await supabase.from('announcements').delete().eq('id', id)
      if (err) throw new Error(err.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements', activeTeam?.id] })
      // The Dashboard's "Laatste bericht" card is fetched inside its nextMatch
      // query, so it needs invalidating too or it keeps showing a deleted post.
      queryClient.invalidateQueries({ queryKey: ['nextMatch', activeTeam?.id] })
    },
    onError: (err) => setError(err.message),
  })

  async function handleDelete(item: AnnouncementItem): Promise<void> {
    const label = item.title?.trim() || item.body.slice(0, 40).trim()
    if (!window.confirm(`Bericht "${label}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    setError('')
    await deleteMutation.mutateAsync(item.id).catch(() => {})
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Berichten</h1>

      {error && <p className="text-sm text-danger">{error}</p>}

      {isLoading ? (
        <PageLoader />
      ) : announcements.length === 0 ? (
        <EmptyState icon={MessageSquare}>Geen berichten</EmptyState>
      ) : (
        <div className="space-y-3">
          {announcements.map((item) => (
            <div key={item.id}
                 className="rounded-xl p-4 border bg-surface border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {item.title && (
                    <h2 className="font-semibold mb-1">{item.title}</h2>
                  )}
                  <p className="text-text-soft text-sm whitespace-pre-wrap">{item.body}</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(item)}
                    disabled={deleteMutation.isPending}
                    title="Bericht verwijderen"
                    aria-label="Bericht verwijderen"
                    className="text-text-faint hover:text-danger transition-colors p-1 flex-shrink-0 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-text-subtle">
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

import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import useTeamStore from '../stores/useTeamStore'
import { formatDateLong } from '../lib/utils'

export default function Announcements() {
  const { activeTeam } = useTeamStore()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeam?.id) return
    supabase
      .from('announcements')
      .select('*, profiles(full_name)')
      .eq('team_id', activeTeam.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAnnouncements(data || [])
        setLoading(false)
      })
  }, [activeTeam?.id])

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Berichten</h1>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-xl p-8 border text-center" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <MessageSquare size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">Geen berichten</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((item) => (
            <div key={item.id}
                 className="rounded-xl p-4 border"
                 style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
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

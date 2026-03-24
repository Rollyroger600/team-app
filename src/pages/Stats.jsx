import { useEffect, useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import useTeamStore from '../stores/useTeamStore'

export default function Stats() {
  const { activeTeam } = useTeamStore()
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeam?.id) return
    supabase
      .from('v_player_stats')
      .select('*')
      .eq('team_id', activeTeam.id)
      .order('goals', { ascending: false })
      .then(({ data }) => {
        setStats(data || [])
        setLoading(false)
      })
  }, [activeTeam?.id])

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Statistieken</h1>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : stats.length === 0 ? (
        <div className="rounded-xl p-8 border text-center" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <BarChart2 size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">Nog geen statistieken beschikbaar</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="px-4 py-3 border-b flex text-xs font-medium text-slate-400 uppercase tracking-wide"
               style={{ borderColor: 'var(--color-border)' }}>
            <span className="flex-1">Speler</span>
            <span className="w-10 text-center">Gesp.</span>
            <span className="w-10 text-center">Uitg.</span>
            <span className="w-10 text-center">Doelp.</span>
            <span className="w-10 text-center">Ass.</span>
          </div>
          {stats.map((player) => (
            <div key={player.player_id}
                 className="flex items-center px-4 py-3 border-b last:border-0 text-sm"
                 style={{ borderColor: 'var(--color-border)' }}>
              <span className="flex-1 font-medium truncate">{player.full_name}</span>
              <span className="w-10 text-center text-slate-300">{player.matches_played || 0}</span>
              <span className="w-10 text-center text-slate-500">{player.times_rostered_off || 0}</span>
              <span className="w-10 text-center font-semibold text-amber-400">{player.goals || 0}</span>
              <span className="w-10 text-center text-slate-300">{player.assists || 0}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

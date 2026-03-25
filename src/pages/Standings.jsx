import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import useTeamStore from '../stores/useTeamStore'

export default function Standings() {
  const { activeTeam } = useTeamStore()
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeTeam?.id) return
    async function load() {
      // First get the league for this team
      const { data: league } = await supabase
        .from('leagues')
        .select('id')
        .eq('team_id', activeTeam.id)
        .maybeSingle()

      if (!league?.id) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('v_league_standings')
        .select('*')
        .eq('league_id', league.id)
        .order('points', { ascending: false })

      setStandings(data || [])
      setLoading(false)
    }
    load()
  }, [activeTeam?.id])

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold pt-2">Competitiestand</h1>

      {loading ? (
        <PageLoader />
      ) : standings.length === 0 ? (
        <EmptyState icon={Trophy}>Nog geen standen beschikbaar</EmptyState>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-surface border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-slate-400 font-medium w-8">#</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Team</th>
                <th className="text-center px-2 py-3 text-slate-400 font-medium">W</th>
                <th className="text-center px-2 py-3 text-slate-400 font-medium">G</th>
                <th className="text-center px-2 py-3 text-slate-400 font-medium">V</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Pnt</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, index) => (
                <tr key={row.team_id}
                    className="border-b last:border-0 border-border"
                    style={{
                      backgroundColor: row.is_own_team ? 'rgba(245,158,11,0.08)' : 'transparent'
                    }}>
                  <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                  <td className="px-4 py-3 font-medium">{row.team_name}</td>
                  <td className="px-2 py-3 text-center text-slate-300">{row.wins}</td>
                  <td className="px-2 py-3 text-center text-slate-300">{row.draws}</td>
                  <td className="px-2 py-3 text-center text-slate-300">{row.losses}</td>
                  <td className="px-4 py-3 text-center font-bold text-amber-400">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

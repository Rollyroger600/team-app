import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { useRealtimeInvalidate } from '../../lib/realtime'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { Profile } from '../../types/app'

interface MatchItem {
  id: string
  match_date: string
  opponent: string
  is_home: boolean
}

interface PlayerItem {
  player_id: string
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

interface AvailRow {
  match_id: string
  player_id: string
  status: string
}

interface AttendanceData {
  matches: MatchItem[]
  players: PlayerItem[]
  // player_id -> match_id -> status
  grid: Record<string, Record<string, string>>
}

const CELL: Record<string, { label: string; classes: string }> = {
  available:   { label: '1', classes: 'bg-green-500/20 text-green-400' },
  unavailable: { label: '0', classes: 'bg-red-500/20 text-red-400' },
  maybe:       { label: '?', classes: 'bg-amber-500/20 text-amber-400' },
}

export default function AdminAttendance(): React.JSX.Element {
  const { activeTeam } = useTeamStore()

  useRealtimeInvalidate('match_availability', ['adminAttendance', activeTeam?.id], !!activeTeam?.id)

  const { data, isLoading } = useQuery<AttendanceData>({
    queryKey: ['adminAttendance', activeTeam?.id],
    queryFn: async (): Promise<AttendanceData> => {
      const [matchesRes, playersRes] = await Promise.all([
        supabase.from('matches')
          .select('id, match_date, opponent, is_home')
          .eq('team_id', activeTeam!.id)
          .order('match_date', { ascending: true }),
        supabase.from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam!.id)
          .eq('active', true),
      ])

      const matches = (matchesRes.data as MatchItem[]) || []
      const players = (playersRes.data as unknown as PlayerItem[]) || []
      const matchIds = matches.map(m => m.id)

      const grid: Record<string, Record<string, string>> = {}
      if (matchIds.length > 0) {
        const { data: availData } = await supabase
          .from('match_availability')
          .select('match_id, player_id, status')
          .in('match_id', matchIds)

        for (const a of (availData as AvailRow[] | null) || []) {
          if (!grid[a.player_id]) grid[a.player_id] = {}
          grid[a.player_id][a.match_id] = a.status
        }
      }

      return { matches, players, grid }
    },
    enabled: !!activeTeam?.id,
  })

  const matches = data?.matches || []
  const players = data?.players || []
  const grid = data?.grid || {}

  const playerName = (p: PlayerItem): string =>
    p?.profiles?.nickname || p?.profiles?.full_name?.split(' ')[0] || '?'

  // Totalen per wedstrijd (# beschikbaar) en per speler (# beschikbaar dit seizoen)
  const matchTotals: Record<string, number> = {}
  for (const m of matches) {
    matchTotals[m.id] = players.filter(p => grid[p.player_id]?.[m.id] === 'available').length
  }
  const playerTotals: Record<string, number> = {}
  for (const p of players) {
    playerTotals[p.player_id] = matches.filter(m => grid[p.player_id]?.[m.id] === 'available').length
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Aanwezigheid</h1>
      </div>

      <p className="text-xs text-text-muted px-1 leading-relaxed">
        Overzicht van opgegeven beschikbaarheid per speler, per wedstrijd. 1 = beschikbaar,
        0 = niet beschikbaar, ? = misschien, leeg = nog geen antwoord.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : matches.length === 0 || players.length === 0 ? (
        <EmptyState icon={CalendarClock}>Nog geen wedstrijden of spelers om weer te geven</EmptyState>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-surface border-border">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 px-3 py-2 text-left font-medium bg-surface-2 text-text-muted"
                      style={{ minWidth: '110px' }}>
                    Speler
                  </th>
                  {matches.map(m => (
                    <th key={m.id} className="px-1.5 py-2 text-center font-medium bg-surface-2 text-text-muted"
                        style={{ minWidth: '46px' }}>
                      <div>{format(parseISO(m.match_date), 'd/M', { locale: nl })}</div>
                      <div className="opacity-60">{m.is_home ? 'T' : 'U'}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-semibold bg-surface-2 text-text"
                      style={{ minWidth: '50px' }}>
                    Totaal
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => (
                  <tr key={p.player_id} className="border-t border-border">
                    <td className="sticky left-0 z-10 px-3 py-1.5 font-medium truncate bg-surface text-text">
                      {playerName(p)}
                    </td>
                    {matches.map(m => {
                      const status = grid[p.player_id]?.[m.id]
                      const cell = status ? CELL[status] : null
                      return (
                        <td key={m.id} className="px-1.5 py-1.5 text-center">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${cell?.classes || 'text-slate-600'}`}>
                            {cell?.label ?? '–'}
                          </span>
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-center font-semibold text-secondary">
                      {playerTotals[p.player_id]}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="sticky left-0 z-10 px-3 py-1.5 font-semibold bg-surface-2 text-text">
                    Totaal
                  </td>
                  {matches.map(m => (
                    <td key={m.id} className="px-1.5 py-1.5 text-center font-semibold text-text">
                      {matchTotals[m.id]}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

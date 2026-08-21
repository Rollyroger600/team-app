import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import EmptyState from '../../components/ui/EmptyState'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { useRealtimeInvalidate } from '../../lib/realtime'
import { STATUSES, type EventKind } from '../../lib/availability'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { Profile } from '../../types/app'

/** Een kolom in de matrix. Wedstrijden en trainingen worden hier op dezelfde
 *  vorm gebracht, zodat de tabel eronder niets van het onderscheid hoeft te weten. */
interface ColumnItem {
  id: string
  date: string
  /** Klein label onder de datum: T/U bij een wedstrijd, de begintijd bij een training. */
  sub: string
}

interface PlayerItem {
  player_id: string
  profiles: Pick<Profile, 'full_name' | 'nickname'> | null
}

interface AttendanceData {
  columns: ColumnItem[]
  players: PlayerItem[]
  // player_id -> column_id -> status
  grid: Record<string, Record<string, string>>
}

/** Alles wat per soort verschilt op één plek, zodat de query en de tabel
 *  eronder identiek blijven. */
const BRON = {
  match: {
    tabel: 'matches',
    kolommen: 'id, match_date, opponent, is_home',
    datumVeld: 'match_date',
    koppelTabel: 'match_availability',
    koppelVeld: 'match_id',
    realtime: 'match_availability',
  },
  training: {
    tabel: 'trainings',
    kolommen: 'id, training_date, start_time',
    datumVeld: 'training_date',
    koppelTabel: 'training_attendance',
    koppelVeld: 'training_id',
    realtime: 'training_attendance',
  },
} as const

/** Single-character markers keep this dense grid readable; the legend explains them. */
const CELL: Record<string, { label: string; classes: string }> = Object.fromEntries(
  STATUSES.map(s => [s.status, { label: s.cell, classes: `${s.dot}/20 ${s.text}` }]),
)

export default function AdminAttendance(): React.JSX.Element {
  const { activeTeam, teamSettings } = useTeamStore()
  const [kind, setKind] = useState<EventKind>('match')
  const bron = BRON[kind]

  useRealtimeInvalidate(bron.realtime, ['adminAttendance', activeTeam?.id, kind], !!activeTeam?.id)

  const { data, isLoading } = useQuery<AttendanceData>({
    queryKey: ['adminAttendance', activeTeam?.id, kind],
    queryFn: async (): Promise<AttendanceData> => {
      const [bronRes, playersRes] = await Promise.all([
        supabase.from(bron.tabel)
          .select(bron.kolommen)
          .eq('team_id', activeTeam!.id)
          .order(bron.datumVeld, { ascending: true }),
        supabase.from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam!.id)
          .eq('active', true),
      ])

      const ruw = (bronRes.data as unknown as Record<string, unknown>[]) || []
      const columns: ColumnItem[] = ruw.map(r => kind === 'match'
        ? { id: r.id as string, date: r.match_date as string, sub: r.is_home ? 'T' : 'U' }
        : { id: r.id as string, date: r.training_date as string, sub: String(r.start_time ?? '').slice(0, 5) })

      const players = (playersRes.data as unknown as PlayerItem[]) || []
      const ids = columns.map(c => c.id)

      const grid: Record<string, Record<string, string>> = {}
      if (ids.length > 0) {
        const { data: availData } = await supabase
          .from(bron.koppelTabel)
          .select(`${bron.koppelVeld}, player_id, status`)
          .in(bron.koppelVeld, ids)

        for (const a of (availData as unknown as Record<string, string>[] | null) || []) {
          const colId = a[bron.koppelVeld]
          if (!grid[a.player_id]) grid[a.player_id] = {}
          grid[a.player_id][colId] = a.status
        }
      }

      return { columns, players, grid }
    },
    enabled: !!activeTeam?.id,
  })

  const columns = data?.columns || []
  const players = data?.players || []
  const grid = data?.grid || {}

  const playerName = (p: PlayerItem): string =>
    p?.profiles?.nickname || p?.profiles?.full_name?.split(' ')[0] || '?'

  // Totalen per kolom en per speler
  const colTotals: Record<string, number> = {}
  for (const c of columns) {
    colTotals[c.id] = players.filter(p => grid[p.player_id]?.[c.id] === 'available').length
  }
  const playerTotals: Record<string, number> = {}
  for (const p of players) {
    playerTotals[p.player_id] = columns.filter(c => grid[p.player_id]?.[c.id] === 'available').length
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Aanwezigheid</h1>
      </div>

      {teamSettings.trainingen_enabled && (
        <div className="flex gap-1 p-1 rounded-xl bg-surface">
          {([
            { key: 'match', label: 'Wedstrijden' },
            { key: 'training', label: 'Trainingen' },
          ] as const).map(o => (
            <button
              key={o.key}
              onClick={() => setKind(o.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                kind === o.key ? 'bg-secondary text-secondary-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-text-muted px-1 leading-relaxed">
        {kind === 'match'
          ? 'Overzicht per speler, per wedstrijd. 1 = beschikbaar, 0 = niet beschikbaar, B = geblesseerd, U = uitgeroosterd (door een beheerder), leeg = nog geen antwoord.'
          : 'Overzicht per speler, per training. 1 = aanwezig, 0 = afwezig, B = geblesseerd, leeg = nog geen antwoord.'}
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
               style={{ borderColor: 'var(--color-secondary)' }} />
        </div>
      ) : columns.length === 0 || players.length === 0 ? (
        <EmptyState icon={CalendarClock}>
          {kind === 'match' ? 'Nog geen wedstrijden of spelers om weer te geven' : 'Nog geen trainingen of spelers om weer te geven'}
        </EmptyState>
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
                  {columns.map(c => (
                    <th key={c.id} className="px-1.5 py-2 text-center font-medium bg-surface-2 text-text-muted"
                        style={{ minWidth: '46px' }}>
                      <div>{format(parseISO(c.date), 'd/M', { locale: nl })}</div>
                      <div className="opacity-60">{c.sub}</div>
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
                    {columns.map(c => {
                      const status = grid[p.player_id]?.[c.id]
                      const cell = status ? CELL[status] : null
                      return (
                        <td key={c.id} className="px-1.5 py-1.5 text-center">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${cell?.classes || 'text-text-faint'}`}>
                            {cell?.label ?? '–'}
                          </span>
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-center font-semibold text-secondary-soft">
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
                  {columns.map(c => (
                    <td key={c.id} className="px-1.5 py-1.5 text-center font-semibold text-text">
                      {colTotals[c.id]}
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

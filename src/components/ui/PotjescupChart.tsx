import React from 'react'
import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { MIN_SESSIONS_FOR_CHART } from '../../lib/potjescup'
import type { PotjescupPlayerSeries } from '../../lib/potjescup'

/**
 * Hoeveel spelers we tekenen. Het hele team (22 lijnen) is op een telefoon een
 * kluwen; de koplopers plus je eigen lijn is wat je wilt zien.
 */
const TOP_N = 5

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
]

/**
 * Eigen lijn buiten de top 5 → neutrale tekstkleur in plaats van een zesde tint. Die is in
 * alle drie de thema's het meest contrastrijk en botst per definitie niet met chart-1..5;
 * de accentkleur deed dat wel (in clubhuis lag secondary-soft dicht tegen chart-5 aan).
 */
const OWN_COLOR = 'var(--color-text)'

interface PotjescupChartProps {
  series: PotjescupPlayerSeries[]
  /** Speler-id van de ingelogde gebruiker; die lijn wordt altijd getekend. */
  ownPlayerId?: string
}

interface ChartRow {
  label: string
  [playerName: string]: string | number
}

function shortDate(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export default function PotjescupChart({ series, ownPlayerId }: PotjescupChartProps): React.JSX.Element | null {
  const { rows, lines } = useMemo(() => {
    // series komt al aflopend op eindtotaal binnen (usePotjescupHistory).
    const top = series.slice(0, TOP_N)
    const own = ownPlayerId ? series.find(s => s.player_id === ownPlayerId) : undefined
    const shown = own && !top.some(s => s.player_id === own.player_id) ? [...top, own] : top

    // Namen kunnen dubbel zijn (twee Martijns); maak de reekssleutel uniek, anders
    // overschrijven ze elkaar in de rij-objecten die recharts verwacht.
    const seen = new Map<string, number>()
    const linesOut = shown.map((s, i) => {
      const count = (seen.get(s.full_name) || 0) + 1
      seen.set(s.full_name, count)
      const key = count > 1 ? `${s.full_name} (${count})` : s.full_name
      const isOwn = s.player_id === ownPlayerId
      const inTop = i < TOP_N
      return {
        key,
        series: s,
        color: isOwn && !inTop ? OWN_COLOR : CHART_COLORS[i % CHART_COLORS.length],
        isOwn,
      }
    })

    const dates = [...new Set(series.flatMap(s => s.points.map(p => p.session_date)))].sort()
    const rowsOut: ChartRow[] = dates.map(date => {
      const row: ChartRow = { label: shortDate(date) }
      for (const l of linesOut) {
        const point = l.series.points.find(p => p.session_date === date)
        if (point) row[l.key] = point.total
      }
      return row
    })

    return { rows: rowsOut, lines: linesOut }
  }, [series, ownPlayerId])

  if (rows.length < MIN_SESSIONS_FOR_CHART || lines.length === 0) return null

  return (
    <div className="rounded-xl border p-4 bg-surface border-border">
      <p className="text-sm font-semibold mb-1">Verloop</p>
      <p className="text-xs text-text-muted mb-3">
        Puntentotaal na elke training — top {TOP_N}
        {lines.some(l => l.isOwn) && ' plus jouw eigen lijn'}.
      </p>

      <div className="h-56 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              stroke="var(--color-border-strong)"
              tickMargin={6}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              stroke="var(--color-border-strong)"
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: '0.75rem',
                fontSize: '12px',
                color: 'var(--color-text)',
              }}
              labelStyle={{ color: 'var(--color-text-muted)' }}
              itemStyle={{ padding: '1px 0' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              iconType="plainline"
              iconSize={14}
            />
            {lines.map(l => (
              <Line
                key={l.key}
                // Bewust linear, geen monotone: punten worden per training toegekend, niet
                // geleidelijk. Een gebogen lijn zou een verloop tussen trainingen suggereren
                // dat er niet is.
                type="linear"
                dataKey={l.key}
                stroke={l.color}
                strokeWidth={l.isOwn ? 3 : 2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
                // Zonder dit tekent recharts de lijn met een stroke-dasharray-animatie die
                // bij elke re-render van de parent opnieuw begint. Op een pagina die vaak
                // hertekent bleef de lijn daardoor op ~2px steken en zag de grafiek er leeg
                // uit. Een animatie voegt hier bovendien niets toe.
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

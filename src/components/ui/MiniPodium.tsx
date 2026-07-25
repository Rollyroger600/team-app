import type { PodiumEntry } from '../../lib/stats'

const MEDALS = ['🥇', '🥈', '🥉']
const ORDER = ['order-2', 'order-1', 'order-3']

interface PodiumRowProps {
  title: string
  entries: PodiumEntry[]
  statLabel: string
}

function PodiumRow({ title, entries, statLabel }: PodiumRowProps) {
  if (entries.length === 0) return null
  return (
    <div className="py-2.5 first:pt-3 last:pb-3">
      <h3 className="text-xs font-semibold text-text-muted mb-1.5">
        {title} <span className="font-normal opacity-70">· {statLabel}</span>
      </h3>
      <div className="flex items-end justify-center gap-1.5">
        {entries.map((entry, i) => (
          <div key={entry.name} className={`flex-1 max-w-[6.5rem] ${ORDER[i]}`}>
            <div
              className="w-full rounded-lg flex items-center justify-center gap-1 px-1.5 py-1.5 border"
              style={{
                backgroundColor: i === 0 ? 'rgba(245,158,11,0.1)' : 'var(--color-surface-2)',
                borderColor: i === 0 ? 'rgba(245,158,11,0.3)' : 'var(--color-border)',
              }}
            >
              <span className="text-sm leading-none flex-shrink-0">{MEDALS[i]}</span>
              <span className="text-xs font-semibold truncate">{entry.name}</span>
              <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--color-secondary)' }}>
                {entry.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface PodiumSection {
  title: string
  statLabel: string
  entries: PodiumEntry[]
}

interface PodiumCardProps {
  sections: PodiumSection[]
}

export function PodiumCard({ sections }: PodiumCardProps) {
  const visible = sections.filter(s => s.entries.length > 0)
  if (visible.length === 0) return null
  return (
    <div className="rounded-xl border px-3 divide-y bg-surface border-border divide-border">
      {visible.map(section => (
        <PodiumRow key={section.title} title={section.title} entries={section.entries} statLabel={section.statLabel} />
      ))}
    </div>
  )
}

interface StatsPodiumsProps {
  topscorers: PodiumEntry[]
  mvps: PodiumEntry[]
}

export default function StatsPodiums({ topscorers, mvps }: StatsPodiumsProps) {
  return (
    <PodiumCard
      sections={[
        { title: '🏑 Topscorer', statLabel: 'doelpunten', entries: topscorers },
        { title: '⭐ MVP', statLabel: 'goals + assists', entries: mvps },
      ]}
    />
  )
}

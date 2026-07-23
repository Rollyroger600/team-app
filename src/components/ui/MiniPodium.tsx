import type { PodiumEntry } from '../../lib/stats'

interface MiniPodiumProps {
  title: string
  entries: PodiumEntry[]
  statSuffix: string
}

export default function MiniPodium({ title, entries, statSuffix }: MiniPodiumProps) {
  if (entries.length === 0) return null
  const medals = ['🥇', '🥈', '🥉']
  const order = ['order-2', 'order-1', 'order-3']

  return (
    <div className="rounded-xl border p-4 bg-surface border-border">
      <h2 className="text-sm font-semibold text-text-muted mb-3">{title}</h2>
      <div className="flex items-end justify-center gap-2">
        {entries.map((entry, i) => (
          <div key={entry.name} className={`flex flex-col items-center flex-1 max-w-[7rem] ${order[i]}`}>
            <span className="text-2xl mb-1">{medals[i]}</span>
            <div
              className={`w-full rounded-xl flex flex-col items-center justify-center px-2 ${
                i === 0 ? 'py-4 border' : 'py-3 border'
              }`}
              style={{
                backgroundColor: i === 0 ? 'rgba(245,158,11,0.1)' : 'var(--color-surface-2)',
                borderColor: i === 0 ? 'rgba(245,158,11,0.3)' : 'var(--color-border)',
              }}
            >
              <p className="text-sm font-semibold truncate w-full text-center">{entry.name}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--color-secondary)' }}>{entry.value}</p>
              <p className="text-[10px] text-text-muted text-center leading-tight">{statSuffix}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

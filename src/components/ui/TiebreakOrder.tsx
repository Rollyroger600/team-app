import { useRef, useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { TIEBREAK_CRITERIA, type TiebreakId } from '../../lib/standings'
import { tint } from '../../lib/utils'

interface TiebreakOrderProps {
  order: TiebreakId[]
  /** Alleen een Hoofdbeheerder mag slepen; de rest leest mee. */
  canEdit: boolean
  onReorder: (next: TiebreakId[]) => void
  saving?: boolean
}

const RANK_LABELS = ['1e', '2e', '3e', '4e', '5e', '6e', '7e', '8e']

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * De tiebreak-volgorde als versleepbare tegels.
 *
 * Bewust géén HTML5 drag-and-drop: `dragstart` vuurt niet op een touchscreen, en
 * dit is in de eerste plaats een telefoon-app. Pointer events dekken muis en
 * vinger met dezelfde code. De sleepgreep zet `touch-action: none`, anders
 * scrollt de pagina mee met de vinger in plaats van de tegel.
 *
 * De pijltjesknoppen zijn geen dubbeling maar het vangnet: ze werken met
 * toetsenbord en voor wie slepen lastig vindt.
 */
export default function TiebreakOrder({ order, canEdit, onReorder, saving }: TiebreakOrderProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [offsetY, setOffsetY] = useState(0)

  // Middens van de tegels op het moment dat het slepen begint. Tijdens het
  // slepen verschuift er niets in de DOM-volgorde, dus deze blijven geldig.
  const midpoints = useRef<number[]>([])
  const startY = useRef(0)

  function handlePointerDown(e: React.PointerEvent, index: number) {
    if (!canEdit || saving) return
    e.preventDefault()
    // currentTarget, niet target: een tik landt vaak op het <svg> ín de greep, en
    // die capture'n laat de pointermove-events buiten de handler vallen.
    e.currentTarget.setPointerCapture(e.pointerId)

    const items = Array.from(listRef.current?.children || []) as HTMLElement[]
    midpoints.current = items.map((el) => {
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2
    })
    startY.current = e.clientY
    setDragIndex(index)
    setTargetIndex(index)
    setOffsetY(0)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragIndex === null) return
    const dy = e.clientY - startY.current
    setOffsetY(dy)

    // Het midden van de gesleepte tegel bepaalt waar hij terechtkomt.
    const carried = midpoints.current[dragIndex] + dy
    let next = 0
    for (let i = 0; i < midpoints.current.length; i++) {
      if (carried > midpoints.current[i]) next = i
    }
    if (carried < midpoints.current[0]) next = 0
    setTargetIndex(next)
  }

  function handlePointerUp() {
    if (dragIndex !== null && targetIndex !== null && targetIndex !== dragIndex) {
      onReorder(move(order, dragIndex, targetIndex))
    }
    setDragIndex(null)
    setTargetIndex(null)
    setOffsetY(0)
  }

  function nudge(index: number, direction: -1 | 1) {
    const to = index + direction
    if (to < 0 || to >= order.length) return
    onReorder(move(order, index, to))
  }

  /** Hoeveel deze tegel opzij moet om plaats te maken voor de gesleepte tegel. */
  function shiftFor(index: number): number {
    if (dragIndex === null || targetIndex === null || index === dragIndex) return 0
    const height = midpoints.current[1] - midpoints.current[0] || 0
    if (dragIndex < targetIndex && index > dragIndex && index <= targetIndex) return -height
    if (dragIndex > targetIndex && index >= targetIndex && index < dragIndex) return height
    return 0
  }

  return (
    <ul ref={listRef} className="space-y-1.5" style={{ touchAction: dragIndex !== null ? 'none' : undefined }}>
      {order.map((id, index) => {
        const criterion = TIEBREAK_CRITERIA[id]
        const isDragging = index === dragIndex
        // Tijdens het slepen toont de rangnummer de plek waar hij zou landen.
        const shownRank = isDragging && targetIndex !== null ? targetIndex : index

        return (
          <li
            key={id}
            className="flex items-center gap-2 rounded-lg border px-2.5 py-2 border-border"
            style={{
              backgroundColor: isDragging ? tint('--color-secondary', 12) : 'var(--color-surface-2)',
              transform: `translateY(${isDragging ? offsetY : shiftFor(index)}px)`,
              transition: isDragging ? 'none' : 'transform 150ms ease',
              zIndex: isDragging ? 2 : 1,
              position: 'relative',
              boxShadow: isDragging ? '0 6px 16px rgba(0,0,0,0.18)' : undefined,
              opacity: saving ? 0.6 : 1,
            }}
          >
            <span className="flex-shrink-0 w-6 text-center text-xs font-bold text-secondary-soft">
              {RANK_LABELS[shownRank] ?? `${shownRank + 1}e`}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">{criterion.label}</p>
              {/* Bewust niet afkappen: deze regel is voor spelers de hele uitleg. */}
              <p className="text-[11px] leading-snug text-text-subtle">{criterion.description}</p>
            </div>

            {canEdit && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => nudge(index, -1)}
                  disabled={index === 0 || saving}
                  aria-label={`${criterion.label} omhoog`}
                  className="w-6 h-6 rounded flex items-center justify-center text-text-muted disabled:opacity-25 hover:bg-surface"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => nudge(index, 1)}
                  disabled={index === order.length - 1 || saving}
                  aria-label={`${criterion.label} omlaag`}
                  className="w-6 h-6 rounded flex items-center justify-center text-text-muted disabled:opacity-25 hover:bg-surface"
                >
                  <ChevronDown size={14} />
                </button>
                <span
                  onPointerDown={(e) => handlePointerDown(e, index)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  aria-hidden="true"
                  className="w-6 h-6 rounded flex items-center justify-center text-text-subtle cursor-grab active:cursor-grabbing"
                  style={{ touchAction: 'none' }}
                >
                  <GripVertical size={14} />
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

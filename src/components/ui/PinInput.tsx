import React from 'react'
import { AlertCircle } from 'lucide-react'

/**
 * Het PIN-toetsenbord van het inlogscherm.
 *
 * Uit Login.tsx getrokken toen de uitnodigingspagina (/i/:code) hetzelfde nodig
 * had. Één implementatie, want een tweede numpad die net iets anders reageert op
 * de zesde tik is precies het soort verschil dat niemand opmerkt tot iemand niet
 * meer binnenkomt.
 */

interface PinInputProps {
  value: string
  onChange: (v: string) => void
  onComplete: (v: string) => void
  loading: boolean
}

export function PinInput({ value, onChange, onComplete, loading }: PinInputProps) {
  function handleKey(d: number | 'del') {
    if (loading) return
    if (d === 'del') {
      onChange(value.slice(0, -1))
      return
    }
    const next = value + String(d)
    if (next.length > 6) return
    onChange(next)
    // Pass the fresh value directly — avoids relying on a closure over
    // state that hasn't re-rendered yet.
    if (next.length === 6) onComplete(next)
  }

  const keyClass =
    'py-4 rounded-xl text-lg font-semibold transition-colors bg-surface-2 hover:bg-border text-text active:scale-95'

  return (
    <div className="space-y-4">
      {/* PIN dots */}
      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border-2 transition-all ${
              i < value.length
                ? 'bg-secondary-soft border-secondary-soft'
                : 'border-border bg-transparent'
            }`}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
          <button key={d} onClick={() => handleKey(d)} className={keyClass}>
            {d}
          </button>
        ))}
        <div />
        <button onClick={() => handleKey(0)} className={keyClass}>0</button>
        <button onClick={() => handleKey('del')} className={keyClass}>⌫</button>
      </div>
    </div>
  )
}

interface ErrorBoxProps {
  children: React.ReactNode
}

export function ErrorBox({ children }: ErrorBoxProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-danger bg-unavailable/10 border border-unavailable/20 rounded-lg px-3 py-2">
      <AlertCircle size={14} className="flex-shrink-0" />
      {children}
    </div>
  )
}

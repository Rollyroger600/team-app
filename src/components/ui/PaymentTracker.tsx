import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { spelerSaldi, type KittyData } from '../../lib/kitty'
import { formatCents } from '../../lib/money'
import { tint } from '../../lib/utils'

interface Member { id: string; name: string }

interface PaymentTrackerProps {
  teamId: string
  members: Member[]
  kitty: KittyData | undefined
  createdBy: string | null
}

/**
 * Wie heeft betaald, en de knop om dat af te vinken.
 *
 * "Voldaan" is geen vlaggetje maar een echte storting ter hoogte van het
 * openstaande bedrag. Daardoor blijft er één waarheid — het saldo volgt uit de
 * boekingen — en klopt het kassaldo meteen mee. Een vlaggetje zou naast de
 * boekingen gaan leven en vroeg of laat afwijken.
 */
export default function PaymentTracker({ teamId, members, kitty, createdBy }: PaymentTrackerProps) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  const saldi = spelerSaldi(
    members.map(m => m.id),
    kitty?.transactions ?? [],
    kitty?.shares ?? [],
    kitty?.levyShares ?? [],
  )
  const naam = (id: string) => members.find(m => m.id === id)?.name ?? '?'

  const open = saldi.filter(s => s.saldo < 0).sort((a, b) => a.saldo - b.saldo)
  const voldaan = saldi.filter(s => s.saldo >= 0 && s.verschuldigd > 0)
  const tegoed = saldi.filter(s => s.saldo > 0)
  const totaalOpen = open.reduce((a, s) => a + s.saldo, 0)

  async function markeerVoldaan(playerId: string, bedrag: number) {
    if (!window.confirm(`${naam(playerId)} heeft ${formatCents(bedrag)} betaald? Dit wordt als storting geboekt.`)) return
    setBusy(playerId)
    await supabase.from('pot_transactions').insert({
      team_id: teamId,
      type: 'contribution',
      amount_cents: bedrag,
      description: 'Inleg voldaan',
      paid_by: playerId,
      created_by: createdBy,
    })
    await queryClient.invalidateQueries({ queryKey: ['kitty', teamId] })
    setBusy(null)
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-surface border-border">
      <div className="px-4 py-3 border-b border-border">
        <p className="font-semibold text-sm flex items-center gap-2"><Users size={15} /> Wie moet nog betalen</p>
        <p className="text-xs text-text-subtle mt-0.5">
          {open.length === 0
            ? 'Iedereen is bij.'
            : `${open.length} van ${members.length} · samen ${formatCents(-totaalOpen)}`}
        </p>
      </div>

      {open.map(s => (
        <div key={s.playerId} className="flex items-center gap-2 px-4 py-2.5 border-b border-border last:border-b-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{naam(s.playerId)}</p>
            <p className="text-[11px] text-text-subtle">
              {formatCents(s.verschuldigd)} opgelegd
              {s.gestort > 0 && ` · ${formatCents(s.gestort)} gestort`}
              {s.voorgeschoten > 0 && ` · ${formatCents(s.voorgeschoten)} voorgeschoten`}
              {s.aandeel > 0 && ` · ${formatCents(s.aandeel)} aandeel`}
            </p>
          </div>
          <span className="text-sm font-semibold text-danger flex-shrink-0">{formatCents(-s.saldo)}</span>
          <button
            onClick={() => markeerVoldaan(s.playerId, -s.saldo)}
            disabled={busy === s.playerId}
            aria-label={`${naam(s.playerId)} heeft betaald`}
            title="Markeer als betaald"
            className="px-2.5 h-8 rounded-lg flex items-center gap-1 text-xs font-semibold flex-shrink-0 disabled:opacity-50 bg-secondary text-secondary-text"
          >
            <Check size={13} /> Voldaan
          </button>
        </div>
      ))}

      {(voldaan.length > 0 || tegoed.length > 0) && (
        <div className="px-4 py-2.5 border-t border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">Bij</p>
          <div className="flex flex-wrap gap-1.5">
            {voldaan.map(s => (
              <span
                key={s.playerId}
                className="text-[11px] px-2 py-1 rounded-full flex items-center gap-1"
                style={{ backgroundColor: tint('--color-available', 15), color: 'var(--color-success)' }}
              >
                <Check size={10} /> {naam(s.playerId)}
                {s.saldo > 0 && ` +${formatCents(s.saldo)}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

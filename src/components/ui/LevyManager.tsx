import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, AlertCircle, Check, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { parseEuroToCents, formatCents, centsToInput } from '../../lib/money'
import { formatDate, tint } from '../../lib/utils'
import type { KittyData } from '../../lib/kitty'

interface Member { id: string; name: string }

interface LevyManagerProps {
  teamId: string
  members: Member[]
  kitty: KittyData | undefined
  createdBy: string | null
}

/**
 * Inlegrondes: "iedereen legt €200 in", met uitzonderingen per speler.
 *
 * Je vult één bedrag voor iedereen in en past daarna alleen de afwijkingen aan —
 * 22 bedragen intypen wil niemand. Een speler op 0 zetten haalt hem uit de ronde;
 * dat is hoe een half seizoen geblesseerde de helft (of niets) betaalt.
 */
export default function LevyManager({ teamId, members, kitty, createdBy }: LevyManagerProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [omschrijving, setOmschrijving] = useState('')
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [standaard, setStandaard] = useState('')
  /** Alleen de spelers die van het standaardbedrag afwijken. */
  const [afwijkend, setAfwijkend] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null)

  const standaardCents = parseEuroToCents(standaard)

  function bedragVoor(id: string): number | null {
    const eigen = afwijkend[id]
    if (eigen === undefined) return standaardCents
    return parseEuroToCents(eigen)
  }

  const regels = members
    .map(m => ({ id: m.id, name: m.name, cents: bedragVoor(m.id) }))
    .filter(r => r.cents !== null && r.cents > 0) as Array<{ id: string; name: string; cents: number }>
  const totaal = regels.reduce((a, r) => a + r.cents, 0)

  async function aanmaken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!omschrijving.trim() || regels.length === 0) return
    setBusy(true); setMelding(null)

    const { data: levy, error } = await supabase.from('pot_levies').insert({
      team_id: teamId,
      description: omschrijving.trim(),
      levy_date: datum,
      created_by: createdBy,
    }).select('id').single()

    if (error || !levy) {
      setBusy(false)
      setMelding({ ok: false, tekst: error?.message ?? 'Kon de inleg niet aanmaken' })
      return
    }

    const { error: shareError } = await supabase.from('pot_levy_shares').insert(
      regels.map(r => ({ levy_id: levy.id, player_id: r.id, amount_cents: r.cents })),
    )
    if (shareError) {
      // Een inleg zonder regels betekent niets; liever helemaal terug dan half.
      await supabase.from('pot_levies').delete().eq('id', levy.id)
      setBusy(false)
      setMelding({ ok: false, tekst: 'Kon de bedragen niet opslaan: ' + shareError.message })
      return
    }

    setBusy(false)
    setOmschrijving(''); setStandaard(''); setAfwijkend({}); setOpen(false)
    queryClient.invalidateQueries({ queryKey: ['kitty', teamId] })
    setMelding({ ok: true, tekst: `Inleg aangemaakt voor ${regels.length} spelers, samen ${formatCents(totaal)}.` })
  }

  async function verwijder(id: string, beschrijving: string) {
    if (!window.confirm(`Inleg "${beschrijving}" verwijderen? De bedragen vervallen dan voor iedereen.`)) return
    await supabase.from('pot_levies').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['kitty', teamId] })
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-secondary-soft bg-surface-2 border-border text-text'
  const labelClass = 'block text-xs font-medium mb-1 text-text-muted'
  const levies = kitty?.levies ?? []
  const levyShares = kitty?.levyShares ?? []

  return (
    <div className="rounded-xl border p-4 space-y-3 bg-surface border-border">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-2"><Receipt size={15} /> Inleg</h2>
        <button
          type="button"
          onClick={() => { setOpen(v => !v); setMelding(null) }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-secondary-text"
        >
          <Plus size={13} /> Nieuwe inleg
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-text-subtle">
        Leg een bedrag op aan het team. Vul één bedrag voor iedereen in en pas daarna
        alleen de uitzonderingen aan — iemand op 0 zetten haalt hem uit deze ronde.
        Wat iemand nog moet betalen is de som van zijn inlegrondes min wat hij al
        stortte of voorschoot.
      </p>

      {melding && (
        <p className={`flex items-center gap-1.5 text-xs ${melding.ok ? 'text-success' : 'text-danger'}`}>
          {melding.ok ? <Check size={12} /> : <AlertCircle size={12} />} {melding.tekst}
        </p>
      )}

      {open && (
        <form onSubmit={aanmaken} className="space-y-2.5 rounded-lg p-3" style={{ backgroundColor: tint('--color-secondary', 6) }}>
          <div>
            <label className={labelClass}>Waarvoor</label>
            <input type="text" value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
                   placeholder="Voorschot seizoen" className={inputClass} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Bedrag voor iedereen</label>
              <input type="text" inputMode="decimal" value={standaard}
                     onChange={e => setStandaard(e.target.value)} placeholder="200,00" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Datum</label>
              <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className={inputClass} />
            </div>
          </div>

          {standaard.trim() !== '' && standaardCents === null && (
            <p className="text-xs text-danger">Dat is geen geldig bedrag.</p>
          )}

          {standaardCents !== null && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-text-muted">Uitzonderingen</p>
              <div className="space-y-1">
                {members.map(m => {
                  const waarde = afwijkend[m.id] ?? centsToInput(standaardCents)
                  const cents = bedragVoor(m.id)
                  const wijktAf = afwijkend[m.id] !== undefined && cents !== standaardCents
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className={`flex-1 text-xs truncate ${cents === 0 ? 'text-text-subtle line-through' : ''}`}>
                        {m.name}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={waarde}
                        onChange={e => setAfwijkend(prev => ({ ...prev, [m.id]: e.target.value }))}
                        className={`w-20 px-2 py-1 rounded-lg border text-xs text-right outline-none bg-surface border-border ${
                          wijktAf ? 'text-secondary-soft font-semibold' : 'text-text-muted'
                        }`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <p className="text-xs rounded-lg px-2.5 py-2 bg-surface">
            {regels.length === 0
              ? 'Nog niemand met een bedrag.'
              : `${regels.length} speler${regels.length === 1 ? '' : 's'}, samen ${formatCents(totaal)}`}
          </p>

          <button type="submit" disabled={busy || !omschrijving.trim() || regels.length === 0}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 bg-secondary text-secondary-text">
            {busy ? 'Bezig...' : 'Inleg aanmaken'}
          </button>
        </form>
      )}

      {levies.length === 0 ? (
        <p className="text-xs text-text-muted">Nog geen inleg opgelegd.</p>
      ) : (
        <div className="space-y-1">
          {levies.map(l => {
            const eigen = levyShares.filter(s => s.levy_id === l.id)
            const som = eigen.reduce((a, s) => a + s.amount_cents, 0)
            return (
              <div key={l.id} className="flex items-center gap-2 py-1.5 border-t border-border first:border-t-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.description}</p>
                  <p className="text-[11px] text-text-subtle">
                    {formatDate(l.levy_date)} · {eigen.length} spelers · {formatCents(som)}
                  </p>
                </div>
                <button onClick={() => verwijder(l.id, l.description)} aria-label={`Inleg ${l.description} verwijderen`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-danger hover:bg-unavailable/10">
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

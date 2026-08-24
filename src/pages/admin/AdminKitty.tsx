import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, AlertCircle, Check, Wallet } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'
import { useKitty, kasSaldo, spelerSaldi, tegoedenTotaal, openstaandTotaal, type PotTransaction } from '../../lib/kitty'
import LevyManager from '../../components/ui/LevyManager'
import PaymentTracker from '../../components/ui/PaymentTracker'
import { parseEuroToCents, formatCents, splitCents } from '../../lib/money'
import { formatDate } from '../../lib/utils'
import { tint } from '../../lib/utils'

interface MemberRow {
  player_id: string
  profiles: { full_name: string | null; nickname: string | null } | null
}

type Soort = 'contribution' | 'expense'

/**
 * Admin → Teamkas. Boeken en verwijderen.
 *
 * Bewust geen wijzigen: een fout corrigeer je door te verwijderen en opnieuw in te
 * voeren. Dat houdt created_by een echt auditspoor, en er is dan ook geen
 * UPDATE-policy nodig op precies de tabel waar geld in staat.
 */
export default function AdminKitty(): React.JSX.Element {
  const { activeTeam, teamSettings } = useTeamStore()
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const { data: kitty } = useKitty(activeTeam?.id)

  const { data: members = [] } = useQuery({
    queryKey: ['kittyMembers', activeTeam?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_memberships')
        .select('player_id, profiles(full_name, nickname)')
        .eq('team_id', activeTeam!.id)
        .eq('active', true)
      return ((data as unknown as MemberRow[]) || [])
        .map(m => ({ id: m.player_id, name: m.profiles?.nickname || m.profiles?.full_name?.split(' ')[0] || '?' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    },
    enabled: !!activeTeam?.id,
  })

  const [soort, setSoort] = useState<Soort>('expense')
  const [bedrag, setBedrag] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [betaaldDoor, setBetaaldDoor] = useState('')
  const [verdelen, setVerdelen] = useState(false)
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null)

  const cents = parseEuroToCents(bedrag)
  const gekozenLijst = [...gekozen]
  const verdeling = verdelen && cents ? splitCents(cents, gekozenLijst) : {}
  const verdeeld = Object.values(verdeling).reduce((a, b) => a + b, 0)

  const kanOpslaan =
    !!cents && cents > 0 && !busy &&
    (soort === 'expense' || !!betaaldDoor) &&
    (!verdelen || gekozenLijst.length > 0)

  function toggle(id: string) {
    setGekozen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function opslaan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeTeam?.id || !cents) return
    setBusy(true); setMelding(null)

    const { data: tx, error } = await supabase.from('pot_transactions').insert({
      team_id: activeTeam.id,
      type: soort,
      amount_cents: cents,
      description: omschrijving.trim() || null,
      transaction_date: datum,
      paid_by: betaaldDoor || null,
      created_by: profile?.id ?? null,
    }).select('id').single()

    if (error || !tx) {
      setBusy(false)
      setMelding({ ok: false, tekst: error?.message ?? 'Kon de boeking niet opslaan' })
      return
    }

    if (verdelen && gekozenLijst.length > 0) {
      const rijen = Object.entries(verdeling).map(([player_id, share_cents]) => ({
        transaction_id: tx.id, player_id, share_cents,
      }))
      const { error: shareError } = await supabase.from('pot_transaction_shares').insert(rijen)
      if (shareError) {
        // Zonder de shares klopt de boeking niet; liever helemaal terug dan half.
        await supabase.from('pot_transactions').delete().eq('id', tx.id)
        setBusy(false)
        setMelding({ ok: false, tekst: 'Kon de verdeling niet opslaan: ' + shareError.message })
        return
      }
    }

    setBusy(false)
    setBedrag(''); setOmschrijving(''); setBetaaldDoor(''); setVerdelen(false); setGekozen(new Set())
    queryClient.invalidateQueries({ queryKey: ['kitty', activeTeam.id] })
    setMelding({ ok: true, tekst: 'Boeking toegevoegd.' })
  }

  async function verwijder(t: PotTransaction) {
    if (!window.confirm(`Boeking van ${formatCents(t.amount_cents)} verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return
    await supabase.from('pot_transactions').delete().eq('id', t.id)
    queryClient.invalidateQueries({ queryKey: ['kitty', activeTeam?.id] })
  }

  const kas = kasSaldo(kitty?.transactions ?? [])
  const alleSaldi = spelerSaldi(
    members.map(m => m.id),
    kitty?.transactions ?? [],
    kitty?.shares ?? [],
    kitty?.levyShares ?? [],
  )
  const openstaand = openstaandTotaal(alleSaldi)
  const tegoeden = tegoedenTotaal(alleSaldi)
  const vrij = kas - tegoeden

  const naamVan = (id: string | null) => id ? (members.find(m => m.id === id)?.name ?? '?') : null
  const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:border-secondary-soft bg-surface-2 border-border text-text'
  const labelClass = 'block text-xs font-medium mb-1 text-text-muted'

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-text"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold">{teamSettings.kitty_name}</h1>
      </div>

      {melding && (
        <p className={`flex items-center gap-1.5 text-sm ${melding.ok ? 'text-success' : 'text-danger'}`}>
          {melding.ok ? <Check size={14} /> : <AlertCircle size={14} />} {melding.tekst}
        </p>
      )}

      {/* Kassaldo bovenaan: dat is het getal waar een penningmeester voor komt. */}
      <div className="rounded-xl border p-4 bg-surface border-border">
        <p className="text-xs uppercase tracking-wide flex items-center gap-1.5 text-text-muted">
          <Wallet size={12} /> In kas
        </p>
        <p className={`text-3xl font-bold mt-1 ${kas < 0 ? 'text-danger' : ''}`}>{formatCents(kas)}</p>
        <p className="text-xs text-text-subtle mt-0.5">
          {kitty?.transactions.length ?? 0} boeking{(kitty?.transactions.length ?? 0) === 1 ? '' : 'en'}
        </p>

        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-y-1 text-xs">
          <span className="text-text-muted">Nog te ontvangen</span>
          <span className="text-right">{formatCents(openstaand)}</span>
          <span className="text-text-muted">Terug te betalen</span>
          <span className="text-right">{formatCents(tegoeden)}</span>
          <span className="font-semibold pt-1">Vrij besteedbaar</span>
          <span className={`text-right font-semibold pt-1 ${vrij < 0 ? 'text-danger' : ''}`}>
            {formatCents(vrij)}
          </span>
        </div>
        <p className="text-[11px] text-text-subtle mt-1.5 leading-relaxed">
          Vrij besteedbaar is wat er in kas staat min de tegoeden van spelers — dat geld is
          al vergeven, ook al staat het er nog.
        </p>
      </div>

      {activeTeam && (
        <LevyManager teamId={activeTeam.id} members={members} kitty={kitty} createdBy={profile?.id ?? null} />
      )}

      {activeTeam && (
        <PaymentTracker teamId={activeTeam.id} members={members} kitty={kitty} createdBy={profile?.id ?? null} />
      )}

      <form onSubmit={opslaan} className="rounded-xl border p-4 space-y-3 bg-surface border-border">
        <h2 className="font-semibold text-sm flex items-center gap-2"><Plus size={15} /> Nieuwe boeking</h2>

        <div className="flex gap-1 p-1 rounded-xl bg-surface-2">
          {([
            { key: 'expense', label: 'Uitgave' },
            { key: 'contribution', label: 'Storting' },
          ] as const).map(o => (
            <button
              key={o.key}
              type="button"
              onClick={() => { setSoort(o.key); setVerdelen(false); setBetaaldDoor('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                soort === o.key ? 'bg-secondary text-secondary-text' : 'text-text-muted'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Bedrag</label>
            {/* Tekstveld met inputMode decimal, geen type=number: op een nl-NL
                Android-toetsenbord staat een komma-toets en Chrome geeft dan een
                lege string terug uit e.target.value. */}
            <input
              type="text"
              inputMode="decimal"
              value={bedrag}
              onChange={e => setBedrag(e.target.value)}
              placeholder="12,50"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Datum</label>
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className={inputClass} />
          </div>
        </div>
        {bedrag.trim() !== '' && cents === null && (
          <p className="text-xs text-danger">Dat is geen geldig bedrag.</p>
        )}

        <div>
          <label className={labelClass}>Omschrijving <span className="text-text-faint">(optioneel)</span></label>
          <input type="text" value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
                 placeholder={soort === 'contribution' ? 'Voorschot' : 'Bierrekening augustus'} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>
            {soort === 'contribution' ? 'Wie stortte' : 'Wie schoot voor'}
            {soort === 'expense' && <span className="text-text-faint"> (leeg = uit de pot betaald)</span>}
          </label>
          <select value={betaaldDoor} onChange={e => setBetaaldDoor(e.target.value)} className={inputClass}>
            <option value="">{soort === 'contribution' ? 'Kies een speler...' : 'Uit de pot'}</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {soort === 'expense' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={verdelen} onChange={e => setVerdelen(e.target.checked)}
                     className="w-4 h-4 rounded accent-[var(--color-secondary)]" />
              <span className="text-sm">Verdelen over bepaalde spelers</span>
            </label>
            {!verdelen && (
              <p className="text-xs text-text-subtle pl-6">
                Zonder verdeling draagt de hele pot deze uitgave — dat is verreweg het meest.
                Vink aan om hem in plaats daarvan tegen bepaalde spelers weg te strepen.
              </p>
            )}

            {verdelen && (
              <div className="pl-6 space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setGekozen(new Set(members.map(m => m.id)))}
                          className="text-xs text-secondary-soft">Iedereen</button>
                  <button type="button" onClick={() => setGekozen(new Set())}
                          className="text-xs text-text-muted">Niemand</button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {members.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs transition-all ${
                        gekozen.has(m.id)
                          ? 'border-secondary-soft text-secondary-soft bg-secondary-soft/10'
                          : 'border-border text-text-muted'
                      }`}
                    >
                      <span className="truncate">{m.name}</span>
                      {gekozen.has(m.id) && verdeling[m.id] != null && (
                        <span className="font-mono flex-shrink-0 ml-1">{formatCents(verdeling[m.id])}</span>
                      )}
                    </button>
                  ))}
                </div>
                {cents != null && gekozenLijst.length > 0 && (
                  <p className="text-xs rounded-lg px-2.5 py-2" style={{ backgroundColor: tint('--color-secondary', 6) }}>
                    Verdeeld: {formatCents(verdeeld)} van {formatCents(cents)}
                    {verdeeld !== cents && <span className="text-danger"> — klopt niet</span>}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={!kanOpslaan}
                className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 bg-secondary text-secondary-text">
          {busy ? 'Bezig...' : 'Boeking toevoegen'}
        </button>
      </form>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide mb-2 text-text-muted">
          Boekingen ({kitty?.transactions.length ?? 0})
        </p>
        {(kitty?.transactions.length ?? 0) === 0 ? (
          <div className="rounded-xl p-8 border text-center bg-surface border-border">
            <Wallet size={32} className="mx-auto mb-2 text-text-faint" />
            <p className="text-sm text-text-muted">Nog geen boekingen.</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden bg-surface border-border">
            {kitty!.transactions.map(t => {
              const shares = kitty!.shares.filter(s => s.transaction_id === t.id)
              return (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.description || (t.type === 'contribution' ? 'Storting' : 'Uitgave')}
                    </p>
                    <p className="text-[11px] text-text-subtle truncate">
                      {formatDate(t.transaction_date)}
                      {t.type === 'contribution' && ` · van ${naamVan(t.paid_by)}`}
                      {t.type === 'expense' && (t.paid_by ? ` · voorgeschoten door ${naamVan(t.paid_by)}` : ' · uit de pot')}
                      {shares.length > 0 && ` · verdeeld over ${shares.length}`}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold flex-shrink-0 ${t.type === 'contribution' ? 'text-success' : 'text-danger'}`}>
                    {t.type === 'contribution' ? '+' : '−'}{formatCents(t.amount_cents)}
                  </span>
                  <button onClick={() => verwijder(t)} aria-label="Boeking verwijderen"
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-danger hover:bg-unavailable/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

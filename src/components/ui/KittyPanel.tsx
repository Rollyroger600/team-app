import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useKitty, kasSaldo, spelerSaldi } from '../../lib/kitty'
import { formatCents } from '../../lib/money'
import { formatDate, tint } from '../../lib/utils'

interface MemberRow {
  player_id: string
  profiles: { full_name: string | null; nickname: string | null } | null
}

interface KittyPanelProps {
  teamId: string
  kittyName: string
  currentUserId: string | undefined
}

/**
 * De teamkas zoals spelers hem zien: kassaldo, jouw eigen stand, wie er nog moet
 * betalen, en het boekingenlogboek.
 *
 * Iedereen ziet alles — die openheid ís het nut van een bierpot, en het scheelt de
 * penningmeester een hoop appjes.
 */
export default function KittyPanel({ teamId, kittyName, currentUserId }: KittyPanelProps) {
  const { data: kitty, isLoading } = useKitty(teamId)
  const [toonLog, setToonLog] = useState(false)

  const { data: members = [] } = useQuery({
    queryKey: ['kittyMembers', teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_memberships')
        .select('player_id, profiles(full_name, nickname)')
        .eq('team_id', teamId)
        .eq('active', true)
      return ((data as unknown as MemberRow[]) || [])
        .map(m => ({ id: m.player_id, name: m.profiles?.nickname || m.profiles?.full_name?.split(' ')[0] || '?' }))
    },
  })

  if (isLoading) return <p className="text-sm text-text-muted">Laden...</p>

  const transactions = kitty?.transactions ?? []
  const shares = kitty?.shares ?? []
  const kas = kasSaldo(transactions)
  const levyShares = kitty?.levyShares ?? []
  const saldi = spelerSaldi(members.map(m => m.id), transactions, shares, levyShares)
  const naam = (id: string) => members.find(m => m.id === id)?.name ?? '?'

  const ik = saldi.find(s => s.playerId === currentUserId)
  // Alleen wie echt nog moet betalen; een tegoed is geen openstaande post.
  const openstaand = saldi.filter(s => s.saldo < 0).sort((a, b) => a.saldo - b.saldo)
  const totaalOpen = openstaand.reduce((a, s) => a + s.saldo, 0)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-4 bg-surface border-border">
        <p className="text-xs uppercase tracking-wide flex items-center gap-1.5 text-text-muted">
          <Wallet size={12} /> {kittyName}
        </p>
        <p className={`text-3xl font-bold mt-1 ${kas < 0 ? 'text-danger' : ''}`}>{formatCents(kas)}</p>
        <p className="text-xs text-text-subtle mt-0.5">
          in kas · {transactions.length} boeking{transactions.length === 1 ? '' : 'en'}
        </p>
      </div>

      {ik && (
        <div className="rounded-xl border p-4 bg-surface border-border">
          <p className="text-xs uppercase tracking-wide text-text-muted">Jouw stand</p>
          <p className={`text-2xl font-bold mt-1 ${ik.saldo < 0 ? 'text-danger' : 'text-success'}`}>
            {formatCents(ik.saldo)}
          </p>
          <p className="text-xs text-text-subtle mt-0.5">
            {ik.saldo < 0
              ? `Je moet nog ${formatCents(-ik.saldo)} betalen`
              : ik.saldo > 0 ? 'Je staat voor' : 'Je staat gelijk'}
          </p>
          <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-y-1 text-xs">
            <span className="text-text-muted">Totaal ingelegd moeten worden</span>
            <span className="text-right">{formatCents(ik.verschuldigd)}</span>
            <span className="text-text-muted">Gestort</span>
            <span className="text-right">{formatCents(ik.gestort)}</span>
            {ik.voorgeschoten > 0 && (<>
              <span className="text-text-muted">Voorgeschoten</span>
              <span className="text-right">{formatCents(ik.voorgeschoten)}</span>
            </>)}
            {ik.aandeel > 0 && (<>
              <span className="text-text-muted">Jouw aandeel in uitgaven</span>
              <span className="text-right">{formatCents(ik.aandeel)}</span>
            </>)}
          </div>
        </div>
      )}

      {openstaand.length > 0 && (
        <div className="rounded-xl border overflow-hidden bg-surface border-border">
          <div className="px-4 py-3 border-b border-border">
            <p className="font-semibold text-sm">Moet nog betalen ({openstaand.length})</p>
            <p className="text-xs text-text-subtle">Samen {formatCents(-totaalOpen)}</p>
          </div>
          {openstaand.map(s => (
            <div key={s.playerId} className="flex items-center justify-between px-4 py-2 border-b border-border last:border-b-0"
                 style={{ backgroundColor: s.playerId === currentUserId ? tint('--color-secondary', 8) : 'transparent' }}>
              <span className="text-sm">{naam(s.playerId)}</span>
              <span className="text-sm font-semibold text-danger">{formatCents(-s.saldo)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden bg-surface border-border">
        <button onClick={() => setToonLog(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold">
          Alle boekingen ({transactions.length})
          {toonLog ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {toonLog && (transactions.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-text-muted">Nog geen boekingen.</p>
        ) : (
          <div className="border-t border-border">
            {transactions.map(t => {
              const n = shares.filter(s => s.transaction_id === t.id).length
              return (
                <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {t.description || (t.type === 'contribution' ? 'Storting' : 'Uitgave')}
                    </p>
                    <p className="text-[11px] text-text-subtle truncate">
                      {formatDate(t.transaction_date)}
                      {t.type === 'contribution' && t.paid_by && ` · van ${naam(t.paid_by)}`}
                      {t.type === 'expense' && (t.paid_by ? ` · voorgeschoten door ${naam(t.paid_by)}` : ' · uit de pot')}
                      {n > 0 && ` · verdeeld over ${n}`}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold flex-shrink-0 ${t.type === 'contribution' ? 'text-success' : 'text-danger'}`}>
                    {t.type === 'contribution' ? '+' : '−'}{formatCents(t.amount_cents)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

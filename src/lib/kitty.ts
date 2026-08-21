import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Teamkas: boekingen ophalen en saldi afleiden.
 *
 * Client-side afgeleid, net als useTeamStats() — bewust géén database-view.
 * v_league_standings is het levende bewijs waarom: die werd zonder
 * security_invoker aangemaakt en gaf daardoor volledig om RLS heen. Op de tabel
 * waar geld in staat wil je die val niet in de buurt hebben.
 */

export interface PotTransaction {
  id: string
  team_id: string
  type: 'contribution' | 'expense'
  amount_cents: number
  description: string | null
  transaction_date: string
  paid_by: string | null
  created_by: string | null
}

export interface PotShare {
  transaction_id: string
  player_id: string
  share_cents: number
}

export interface KittyData {
  transactions: PotTransaction[]
  shares: PotShare[]
}

export const TRANSACTION_SELECT =
  'id, team_id, type, amount_cents, description, transaction_date, paid_by, created_by'

export function useKitty(teamId: string | undefined, enabled = true) {
  return useQuery<KittyData>({
    queryKey: ['kitty', teamId],
    queryFn: async () => {
      const { data: transactions } = await supabase
        .from('pot_transactions')
        .select(TRANSACTION_SELECT)
        .eq('team_id', teamId!)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })

      const list = (transactions as unknown as PotTransaction[]) || []
      if (list.length === 0) return { transactions: [], shares: [] }

      const { data: shares } = await supabase
        .from('pot_transaction_shares')
        .select('transaction_id, player_id, share_cents')
        .in('transaction_id', list.map(t => t.id))

      return { transactions: list, shares: (shares as unknown as PotShare[]) || [] }
    },
    enabled: !!teamId && enabled,
    // Geld verandert maandelijks, niet per minuut: refetch-on-focus volstaat,
    // realtime is hier overdreven.
  })
}

export interface PlayerBalance {
  playerId: string
  /** Wat deze speler in de pot heeft gestort. */
  gestort: number
  /** Wat deze speler heeft voorgeschoten en dus tegoed heeft. */
  voorgeschoten: number
  /** Zijn deel van uitgaven die over een groep verdeeld zijn. */
  aandeel: number
  /** Wat er van hem verwacht wordt (de vaste inleg). */
  verwacht: number
  /** Positief = staat voor, negatief = moet nog betalen. */
  saldo: number
}

/**
 * Kassaldo = alles wat erin ging min wat er uit de pot betaald is.
 *
 * Een voorgeschoten uitgave (`paid_by` gevuld) raakt de pot NIET: er ging geen
 * geld uit de kas, iemand legde het voor. Dat verschijnt als tegoed bij die
 * persoon en niet als min op de kas.
 */
export function kasSaldo(transactions: PotTransaction[]): number {
  let saldo = 0
  for (const t of transactions) {
    if (t.type === 'contribution') saldo += t.amount_cents
    else if (t.paid_by === null) saldo -= t.amount_cents
  }
  return saldo
}

/**
 * Saldo per speler:
 *   gestort + voorgeschoten − aandeel − verwachte inleg
 *
 * Negatief betekent: deze speler moet nog betalen.
 */
export function spelerSaldi(
  playerIds: string[],
  transactions: PotTransaction[],
  shares: PotShare[],
  verwachtPerSpeler: number,
): PlayerBalance[] {
  const gestort: Record<string, number> = {}
  const voorgeschoten: Record<string, number> = {}
  const aandeel: Record<string, number> = {}

  for (const t of transactions) {
    if (!t.paid_by) continue
    if (t.type === 'contribution') gestort[t.paid_by] = (gestort[t.paid_by] ?? 0) + t.amount_cents
    else voorgeschoten[t.paid_by] = (voorgeschoten[t.paid_by] ?? 0) + t.amount_cents
  }
  for (const s of shares) {
    aandeel[s.player_id] = (aandeel[s.player_id] ?? 0) + s.share_cents
  }

  return playerIds.map(id => {
    const g = gestort[id] ?? 0
    const v = voorgeschoten[id] ?? 0
    const a = aandeel[id] ?? 0
    return {
      playerId: id,
      gestort: g,
      voorgeschoten: v,
      aandeel: a,
      verwacht: verwachtPerSpeler,
      saldo: g + v - a - verwachtPerSpeler,
    }
  })
}

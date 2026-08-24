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

export interface PotLevy {
  id: string
  description: string
  levy_date: string
}

export interface LevyShare {
  levy_id: string
  player_id: string
  amount_cents: number
}

export interface KittyData {
  transactions: PotTransaction[]
  shares: PotShare[]
  levies: PotLevy[]
  levyShares: LevyShare[]
}

export const TRANSACTION_SELECT =
  'id, team_id, type, amount_cents, description, transaction_date, paid_by, created_by'

export function useKitty(teamId: string | undefined, enabled = true) {
  return useQuery<KittyData>({
    queryKey: ['kitty', teamId],
    queryFn: async () => {
      const [txRes, levyRes] = await Promise.all([
        supabase
          .from('pot_transactions')
          .select(TRANSACTION_SELECT)
          .eq('team_id', teamId!)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('pot_levies')
          .select('id, description, levy_date')
          .eq('team_id', teamId!)
          .order('levy_date', { ascending: false }),
      ])

      const list = (txRes.data as unknown as PotTransaction[]) || []
      const levies = (levyRes.data as unknown as PotLevy[]) || []

      const [shareRes, levyShareRes] = await Promise.all([
        list.length > 0
          ? supabase.from('pot_transaction_shares')
              .select('transaction_id, player_id, share_cents')
              .in('transaction_id', list.map(t => t.id))
          : Promise.resolve({ data: [] }),
        levies.length > 0
          ? supabase.from('pot_levy_shares')
              .select('levy_id, player_id, amount_cents')
              .in('levy_id', levies.map(l => l.id))
          : Promise.resolve({ data: [] }),
      ])

      return {
        transactions: list,
        shares: (shareRes.data as unknown as PotShare[]) || [],
        levies,
        levyShares: (levyShareRes.data as unknown as LevyShare[]) || [],
      }
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
  /** Wat er in totaal aan inlegrondes op zijn naam staat. */
  verschuldigd: number
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
 * Wat er van het kassaldo al vergeven is: de tegoeden van spelers.
 *
 * Wie voorschoot heeft een claim op de pot. Die wordt ooit voldaan -- door terug
 * te betalen (dan zakt de kas) of door te verrekenen met zijn volgende inleg (dan
 * komt er minder binnen). Hoe dan ook is dat geld niet meer vrij besteedbaar, ook
 * al staat het nog op de rekening.
 */
export function tegoedenTotaal(saldi: PlayerBalance[]): number {
  return saldi.filter(s => s.saldo > 0).reduce((a, s) => a + s.saldo, 0)
}

/** Nog te ontvangen: de som van wie achterloopt. */
export function openstaandTotaal(saldi: PlayerBalance[]): number {
  return -saldi.filter(s => s.saldo < 0).reduce((a, s) => a + s.saldo, 0)
}

/**
 * Saldo per speler:
 *   gestort + voorgeschoten − aandeel in uitgaven − verschuldigd
 *
 * Negatief betekent: deze speler moet nog betalen.
 *
 * Verrekenen gaat hier vanzelf. Wie €50 voorschoot heeft €50 tegoed; komt er een
 * inlegronde van €100 bij, dan staat er nog €50 open in plaats van €100. Dat is
 * precies "dan hoeft die persoon minder in te leggen", zonder aparte boeking.
 */
export function spelerSaldi(
  playerIds: string[],
  transactions: PotTransaction[],
  shares: PotShare[],
  levyShares: LevyShare[],
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

  const verschuldigd: Record<string, number> = {}
  for (const l of levyShares) {
    verschuldigd[l.player_id] = (verschuldigd[l.player_id] ?? 0) + l.amount_cents
  }

  return playerIds.map(id => {
    const g = gestort[id] ?? 0
    const v = voorgeschoten[id] ?? 0
    const a = aandeel[id] ?? 0
    const d = verschuldigd[id] ?? 0
    return {
      playerId: id,
      gestort: g,
      voorgeschoten: v,
      aandeel: a,
      verschuldigd: d,
      saldo: g + v - a - d,
    }
  })
}

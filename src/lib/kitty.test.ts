import { describe, it, expect } from 'vitest'
import {
  spelerSaldi, kasSaldo, tegoedenTotaal, openstaandTotaal,
  type PotTransaction, type PotShare, type LevyShare,
} from './kitty'

let teller = 0
function boeking(
  type: 'contribution' | 'expense',
  bedrag: number,
  paidBy: string | null,
): PotTransaction {
  return {
    id: `t${teller++}`, team_id: 'team', type, amount_cents: bedrag,
    description: null, transaction_date: '2026-09-01', paid_by: paidBy, created_by: 'admin',
  }
}
const inleg = (player: string, bedrag: number): LevyShare =>
  ({ levy_id: 'l1', player_id: player, amount_cents: bedrag })
const aandeel = (player: string, bedrag: number): PotShare =>
  ({ transaction_id: 't-diner', player_id: player, share_cents: bedrag })

describe('kasSaldo', () => {
  it('telt stortingen op en uitgaven uit de pot eraf', () => {
    expect(kasSaldo([
      boeking('contribution', 20000, 'p1'),
      boeking('contribution', 20000, 'p2'),
      boeking('expense', 15000, null),
    ])).toBe(25000)
  })

  // Dit is de kern van het model: wie voorschiet haalt geen geld uit de kas.
  // Zou dat wel meetellen, dan zou de kas twee keer geraakt worden -- één keer
  // bij het voorschot en nog eens bij het terugbetalen.
  it('laat een voorgeschoten uitgave de kas ongemoeid', () => {
    expect(kasSaldo([
      boeking('contribution', 20000, 'p1'),
      boeking('expense', 5000, 'p1'),
    ])).toBe(20000)
  })
})

describe('spelerSaldi', () => {
  it('rekent inleg af tegen wat er gestort is', () => {
    const [s] = spelerSaldi(['p1'], [boeking('contribution', 20000, 'p1')], [], [inleg('p1', 20000)])
    expect(s.saldo).toBe(0)
    expect(s.gestort).toBe(20000)
    expect(s.verschuldigd).toBe(20000)
  })

  it('laat wie nog niets stortte in de min staan', () => {
    const [s] = spelerSaldi(['p1'], [], [], [inleg('p1', 20000)])
    expect(s.saldo).toBe(-20000)
  })

  // Het scenario dat Rogier expliciet noemde: wie voorschiet hoeft de volgende
  // keer minder in te leggen. Dat moet vanzelf gaan, zonder aparte boeking.
  it('verrekent een voorschot met de volgende inleg', () => {
    const [s] = spelerSaldi(
      ['p1'],
      [boeking('expense', 5000, 'p1')],
      [],
      [inleg('p1', 20000)],
    )
    expect(s.voorgeschoten).toBe(5000)
    expect(s.saldo).toBe(-15000)
  })

  it('trekt een aandeel in een gesplitste uitgave af', () => {
    const [s] = spelerSaldi(
      ['p1'],
      [boeking('contribution', 20000, 'p1')],
      [aandeel('p1', 2000)],
      [inleg('p1', 20000)],
    )
    expect(s.aandeel).toBe(2000)
    expect(s.saldo).toBe(-2000)
  })

  it('geeft een speler zonder enige boeking een saldo van 0', () => {
    const [s] = spelerSaldi(['nieuw'], [], [], [])
    expect(s.saldo).toBe(0)
    expect(s.verschuldigd).toBe(0)
  })

  it('houdt de spelers uit elkaar', () => {
    const saldi = spelerSaldi(
      ['p1', 'p2'],
      [boeking('contribution', 20000, 'p1')],
      [],
      [inleg('p1', 20000), inleg('p2', 20000)],
    )
    expect(saldi.find(s => s.playerId === 'p1')!.saldo).toBe(0)
    expect(saldi.find(s => s.playerId === 'p2')!.saldo).toBe(-20000)
  })
})

describe('tegoeden en openstaand', () => {
  it('scheidt wie voorstaat van wie achterloopt', () => {
    const saldi = spelerSaldi(
      ['p1', 'p2', 'p3'],
      [boeking('contribution', 20000, 'p1'), boeking('expense', 5000, 'p3')],
      [],
      [inleg('p1', 20000), inleg('p2', 20000)],
    )
    // p1 is bij (0), p2 moet nog €200, p3 heeft €50 tegoed van zijn voorschot.
    expect(openstaandTotaal(saldi)).toBe(20000)
    expect(tegoedenTotaal(saldi)).toBe(5000)
  })
})

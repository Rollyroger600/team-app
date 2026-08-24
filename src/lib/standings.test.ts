import { describe, it, expect } from 'vitest'
import {
  normalizeTiebreakOrder, compareByTiebreak, DEFAULT_TIEBREAK_ORDER,
  type StandingLike,
} from './standings'

const team = (id: string, won: number, gf: number, ga: number): StandingLike => ({ id, won, gf, ga })
const geenOnderling = () => 0

describe('normalizeTiebreakOrder', () => {
  // De kolom is een vrije text[], dus hij kan van alles bevatten. De stand moet
  // hoe dan ook volledig gedefinieerd blijven.
  it('valt terug op de standaard als er niets is opgeslagen', () => {
    expect(normalizeTiebreakOrder(null)).toEqual(DEFAULT_TIEBREAK_ORDER)
    expect(normalizeTiebreakOrder(undefined)).toEqual(DEFAULT_TIEBREAK_ORDER)
    expect(normalizeTiebreakOrder([])).toEqual(DEFAULT_TIEBREAK_ORDER)
  })

  it('gooit onbekende criteria weg', () => {
    expect(normalizeTiebreakOrder(['goals_for', 'bestaat_niet'])[0]).toBe('goals_for')
    expect(normalizeTiebreakOrder(['bestaat_niet'])).toEqual(DEFAULT_TIEBREAK_ORDER)
  })

  it('vult ontbrekende criteria achteraan aan', () => {
    const uitkomst = normalizeTiebreakOrder(['goals_for'])
    expect(uitkomst[0]).toBe('goals_for')
    expect([...uitkomst].sort()).toEqual([...DEFAULT_TIEBREAK_ORDER].sort())
  })

  it('ontdubbelt', () => {
    const uitkomst = normalizeTiebreakOrder(['wins', 'wins', 'goals_for'])
    expect(uitkomst.filter(id => id === 'wins')).toHaveLength(1)
    expect(uitkomst).toHaveLength(DEFAULT_TIEBREAK_ORDER.length)
  })
})

describe('compareByTiebreak', () => {
  it('zet de winnaar van het eerste criterium bovenaan', () => {
    const a = team('a', 5, 10, 10)
    const b = team('b', 3, 30, 10)
    // Negatief betekent: a boven b. Met wins eerst wint a ondanks minder doelpunten.
    expect(compareByTiebreak(['wins', 'goals_for'], a, b, geenOnderling)).toBeLessThan(0)
    // Met goals_for eerst kantelt het.
    expect(compareByTiebreak(['goals_for', 'wins'], a, b, geenOnderling)).toBeGreaterThan(0)
  })

  it('gaat door naar het volgende criterium bij gelijkspel', () => {
    const a = team('a', 5, 20, 5)
    const b = team('b', 5, 20, 9)
    expect(compareByTiebreak(['wins', 'goals_for'], a, b, geenOnderling)).toBe(0)
    // goals_against telt andersom: minder tegen is beter.
    expect(compareByTiebreak(['wins', 'goals_for', 'goals_against'], a, b, geenOnderling)).toBeLessThan(0)
  })

  it('rekent doelsaldo als voor min tegen', () => {
    const a = team('a', 0, 10, 2)  // +8
    const b = team('b', 0, 30, 25) // +5
    expect(compareByTiebreak(['goal_difference'], a, b, geenOnderling)).toBeLessThan(0)
  })

  it('laat het onderlinge resultaat door de meegegeven functie beslissen', () => {
    const a = team('a', 5, 20, 10)
    const b = team('b', 5, 20, 10)
    expect(compareByTiebreak(['head_to_head'], a, b, () => -1)).toBeLessThan(0)
    expect(compareByTiebreak(['head_to_head'], a, b, () => 1)).toBeGreaterThan(0)
  })

  it('geeft 0 als twee teams op alles gelijk staan', () => {
    const a = team('a', 5, 20, 10)
    const b = team('b', 5, 20, 10)
    expect(compareByTiebreak(DEFAULT_TIEBREAK_ORDER, a, b, geenOnderling)).toBe(0)
  })
})

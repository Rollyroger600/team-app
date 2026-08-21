/**
 * De volgorde waarin gelijke punten worden ontknoopt.
 *
 * Punten staan altijd voorop en zitten daarom niet in deze lijst — pas als die
 * gelijk zijn komen de criteria hieronder in beeld, in de volgorde die per team
 * is ingesteld (`teams.tiebreak_order`). Dat is instelbaar omdat het per bond,
 * competitie en sport verschilt: de KNHB kijkt eerst naar doelsaldo, sommige
 * competities eerst naar het onderlinge resultaat.
 */

export type TiebreakId =
  | 'wins'
  | 'goal_difference'
  | 'goals_for'
  | 'goals_against'
  | 'head_to_head'

export interface TiebreakCriterion {
  id: TiebreakId
  /** Korte naam op de tegel. */
  label: string
  /** Eén regel uitleg eronder, in spelerstaal. */
  description: string
}

export const TIEBREAK_CRITERIA: Record<TiebreakId, TiebreakCriterion> = {
  wins: {
    id: 'wins',
    label: 'Gewonnen wedstrijden',
    description: 'Wie er meer heeft gewonnen, staat boven',
  },
  goal_difference: {
    id: 'goal_difference',
    label: 'Doelsaldo',
    description: 'Doelpunten voor min doelpunten tegen',
  },
  goals_for: {
    id: 'goals_for',
    label: 'Doelpunten voor',
    description: 'Wie er meer heeft gescoord, staat boven',
  },
  goals_against: {
    id: 'goals_against',
    label: 'Doelpunten tegen',
    description: 'Wie er minder heeft geïncasseerd, staat boven',
  },
  head_to_head: {
    id: 'head_to_head',
    label: 'Onderling resultaat',
    description: 'De wedstrijden die deze twee teams tegen elkaar speelden',
  },
}

/**
 * Reproduceert de volgorde die vóór deze instelling hardgecodeerd in
 * MiniStandings stond: gewonnen wedstrijden, doelsaldo, doelpunten voor,
 * onderling resultaat. `goals_against` staat er als vijfde achter — die kon
 * eerder niet meespelen en verandert alleen iets als álle vier ervoor gelijk
 * zijn, waar de sortering voorheen op de fysieke rijvolgorde terugviel.
 */
export const DEFAULT_TIEBREAK_ORDER: TiebreakId[] = [
  'wins',
  'goal_difference',
  'goals_for',
  'head_to_head',
  'goals_against',
]

const ALL_IDS = Object.keys(TIEBREAK_CRITERIA) as TiebreakId[]

/**
 * Maakt van een opgeslagen waarde een bruikbare, volledige volgorde.
 *
 * De kolom is een vrije `text[]`, dus hij kan een onbekend criterium bevatten
 * (verwijderd in een latere versie) of er juist eentje missen (toegevoegd na het
 * opslaan). Onbekende namen vallen weg, ontbrekende komen er in de standaard-
 * volgorde achteraan bij. Zo blijft de stand altijd volledig gedefinieerd.
 */
export function normalizeTiebreakOrder(raw: string[] | null | undefined): TiebreakId[] {
  const seen = new Set<TiebreakId>()
  const out: TiebreakId[] = []

  for (const value of raw || []) {
    const id = value as TiebreakId
    if (ALL_IDS.includes(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  for (const id of DEFAULT_TIEBREAK_ORDER) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

/** De velden die een criterium nodig heeft. Losgekoppeld van StandingRow zodat
 *  deze module niets van de UI hoeft te weten. */
export interface StandingLike {
  id: string
  won: number
  gf: number
  ga: number
}

/**
 * Past één criterium toe. Negatief = `a` boven `b`, positief = `b` boven `a`,
 * 0 = onbeslist, dan is het volgende criterium aan de beurt.
 */
function applyCriterion(
  id: TiebreakId,
  a: StandingLike,
  b: StandingLike,
  headToHead: (aId: string, bId: string) => number,
): number {
  switch (id) {
    case 'wins':
      return b.won - a.won
    case 'goal_difference':
      return (b.gf - b.ga) - (a.gf - a.ga)
    case 'goals_for':
      return b.gf - a.gf
    case 'goals_against':
      // Minder tegen is beter, dus andersom dan de rest.
      return a.ga - b.ga
    case 'head_to_head':
      return headToHead(a.id, b.id)
  }
}

/**
 * Vergelijkt twee teams die op punten gelijk staan, langs de ingestelde
 * volgorde. Stopt bij het eerste criterium dat een verschil oplevert.
 */
export function compareByTiebreak(
  order: TiebreakId[],
  a: StandingLike,
  b: StandingLike,
  headToHead: (aId: string, bId: string) => number,
): number {
  for (const id of order) {
    const result = applyCriterion(id, a, b, headToHead)
    if (result !== 0) return result
  }
  return 0
}

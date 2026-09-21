import { describe, it, expect } from 'vitest'
import { nextMatchday } from './matchdays'

const r = (matchday: number, match_date: string | null) => ({ matchday, match_date })
const seizoen = [
  r(1, '2026-09-06'), r(1, '2026-09-06'),
  r(2, '2026-09-13'), r(3, '2026-09-20'),
  r(4, '2026-09-27'), r(5, null),
]

describe('nextMatchday', () => {
  it('kiest de eerstvolgende ronde na de laatst gespeelde', () => {
    expect(nextMatchday(seizoen, '2026-09-21')).toBe(4)
  })

  it('telt een ronde van vandaag nog als eerstvolgend', () => {
    expect(nextMatchday(seizoen, '2026-09-27')).toBe(4)
  })

  // Anders blijft een ronde waarvan één wedstrijd naar oktober is verplaatst
  // wekenlang "eerstvolgend" terwijl de rest allang gespeeld is.
  it('laat zich niet vasthouden door één verplaatste wedstrijd', () => {
    expect(nextMatchday([...seizoen, r(1, '2026-10-15')], '2026-09-21')).toBe(4)
  })

  it('valt terug op een ronde die nog ingepland moet worden', () => {
    expect(nextMatchday(seizoen, '2026-12-01')).toBe(5)
  })

  it('toont aan het einde van het seizoen de laatste ronde, niet ronde 1', () => {
    expect(nextMatchday(seizoen.filter(m => m.match_date), '2026-12-01')).toBe(4)
  })

  it('begint bij 1 als er nog niets is', () => {
    expect(nextMatchday([], '2026-09-21')).toBe(1)
  })

  it('kan tegen een datum met tijd erachter', () => {
    expect(nextMatchday([r(1, '2026-09-06T00:00:00'), r(2, '2026-09-27T00:00:00')], '2026-09-21')).toBe(2)
  })
})

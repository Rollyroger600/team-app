import { describe, it, expect } from 'vitest'
import { generateDates, homeWeekRange, toISODate, parseDate } from './trainings'

describe('parseDate', () => {
  // new Date("2026-09-01") zonder tijd wordt als UTC gelezen en schuift in
  // Nederland een dag terug. Dat is precies het soort fout dat pas in productie
  // opvalt, en alleen in bepaalde maanden.
  it('leest een datum als lokale middernacht, niet als UTC', () => {
    const d = parseDate('2026-09-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(1)
  })

  it('is rond met toISODate', () => {
    expect(toISODate(parseDate('2026-12-31'))).toBe('2026-12-31')
  })
})

describe('generateDates', () => {
  it('geeft elke week dezelfde weekdag binnen het bereik', () => {
    // 2026-09-01 is een dinsdag; weekday 2 = dinsdag.
    expect(generateDates('2026-09-01', '2026-09-30', 2, 1)).toEqual([
      '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29',
    ])
  })

  it('slaat weken over bij een interval groter dan 1', () => {
    expect(generateDates('2026-09-01', '2026-09-30', 2, 2)).toEqual([
      '2026-09-01', '2026-09-15', '2026-09-29',
    ])
  })

  it('schuift naar de eerste voorkomende weekdag vanaf de begindatum', () => {
    // Begin op dinsdag, vraag donderdag (4): eerste treffer is 3 september.
    expect(generateDates('2026-09-01', '2026-09-17', 4, 1)).toEqual([
      '2026-09-03', '2026-09-10', '2026-09-17',
    ])
  })

  it('neemt de einddatum mee als die precies op de weekdag valt', () => {
    expect(generateDates('2026-09-01', '2026-09-08', 2, 1)).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('geeft niets terug bij een omgekeerd of ongeldig bereik', () => {
    expect(generateDates('2026-09-30', '2026-09-01', 2, 1)).toEqual([])
    expect(generateDates('onzin', '2026-09-01', 2, 1)).toEqual([])
  })
})

describe('homeWeekRange', () => {
  // De afspraak op Home: trainingen van déze week, een training die is geweest
  // verdwijnt, en op maandag staat de nieuwe week er meteen.
  it('loopt van vandaag tot en met zondag', () => {
    const maandag = new Date(2026, 7, 24, 12, 0, 0)
    expect(maandag.getDay()).toBe(1)
    expect(homeWeekRange(maandag)).toEqual({ from: '2026-08-24', to: '2026-08-30' })
  })

  it('laat wat geweest is vallen door pas vandaag te beginnen', () => {
    const donderdag = new Date(2026, 7, 27, 12, 0, 0)
    expect(homeWeekRange(donderdag)).toEqual({ from: '2026-08-27', to: '2026-08-30' })
  })

  // Zondag is de laatste dag van de week, niet de eerste -- de klassieke
  // getDay()-val, want JavaScript nummert zondag als 0.
  it('houdt op zondag zondag zelf nog vast', () => {
    const zondag = new Date(2026, 7, 30, 12, 0, 0)
    expect(zondag.getDay()).toBe(0)
    expect(homeWeekRange(zondag)).toEqual({ from: '2026-08-30', to: '2026-08-30' })
  })
})

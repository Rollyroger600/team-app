import { describe, it, expect } from 'vitest'
import { parseEuroToCents, formatCents, centsToInput, splitCents } from './money'

describe('parseEuroToCents', () => {
  it('leest de Nederlandse komma', () => {
    expect(parseEuroToCents('12,50')).toBe(1250)
    expect(parseEuroToCents('0,00')).toBe(0)
    expect(parseEuroToCents('999999,99')).toBe(99999999)
  })

  // Waarom dit ertoe doet: op een nl-NL Android-toetsenbord staat een
  // komma-toets. Met <input type="number"> geeft Chrome dan "" terug en zie je
  // niet wat de gebruiker typte -- vandaar type="text" plus deze parser.
  it('leest ook de punt als decimaal, mits precies twee decimalen', () => {
    expect(parseEuroToCents('12.50')).toBe(1250)
  })

  it('behandelt een punt met drie cijfers erachter als duizendtal', () => {
    // "1.005" is in Nederlandse notatie duizend-en-vijf, niet één euro vijf.
    expect(parseEuroToCents('1.005')).toBe(100500)
    expect(parseEuroToCents('1.234')).toBe(123400)
    expect(parseEuroToCents('1.234.567')).toBe(123456700)
  })

  it('combineert duizendtalpunt en decimale komma', () => {
    expect(parseEuroToCents('1.234,56')).toBe(123456)
  })

  it('negeert euroteken en spaties', () => {
    expect(parseEuroToCents('€ 12,50')).toBe(1250)
    expect(parseEuroToCents('€12,50')).toBe(1250)
    expect(parseEuroToCents(' 50 ')).toBe(5000)
  })

  // De klassieke drijvendekomma-val: 1.005 * 100 = 100.49999999999999, wat naar
  // beneden zou afronden en stil een cent laat verdwijnen.
  it('rondt een halve cent naar boven af in plaats van hem te verliezen', () => {
    expect(parseEuroToCents('1,005')).toBe(101)
  })

  it('weigert wat geen bedrag is', () => {
    expect(parseEuroToCents('')).toBeNull()
    expect(parseEuroToCents('abc')).toBeNull()
    expect(parseEuroToCents('12,50,60')).toBeNull()
    expect(parseEuroToCents('-5')).toBeNull()
  })
})

describe('splitCents', () => {
  // De reden dat dit bestaat: 10/3 in centen moet 1000 blijven, niet 999.
  it('verdeelt cent-exact, zonder zoekgeraakte rest', () => {
    const uitkomst = splitCents(1000, ['c', 'a', 'b'])
    expect(uitkomst).toEqual({ a: 334, b: 333, c: 333 })
    expect(Object.values(uitkomst).reduce((x, y) => x + y, 0)).toBe(1000)
  })

  // Deterministisch op id gesorteerd, niet op invoervolgorde: anders krijgt een
  // andere speler de restcent zodra de lijst in een andere volgorde binnenkomt.
  it('geeft de restcent altijd aan dezelfde speler', () => {
    expect(splitCents(1000, ['a', 'b', 'c'])).toEqual(splitCents(1000, ['c', 'b', 'a']))
  })

  it('gaat netjes om met lege of zinloze invoer', () => {
    expect(splitCents(1000, [])).toEqual({})
    expect(splitCents(-5, ['a'])).toEqual({})
    expect(splitCents(0, ['a'])).toEqual({})
  })
})

describe('weergave', () => {
  it('toont een bedrag in Nederlandse notatie', () => {
    // Intl gebruikt een smalle spatie na het euroteken; daarom op cijfers toetsen.
    expect(formatCents(123456)).toContain('1.234,56')
    expect(formatCents(0)).toContain('0,00')
  })

  it('geeft een invoerveld een waarde zonder euroteken', () => {
    expect(centsToInput(1250)).toBe('12,50')
    expect(centsToInput(0)).toBe('0,00')
  })
})

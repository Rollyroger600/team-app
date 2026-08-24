import { describe, it, expect } from 'vitest'
import { normalizeCode, formatCode } from './accessCodes'

describe('normalizeCode', () => {
  // De code komt uit WhatsApp, van een briefje of uit een plakactie. Streepjes,
  // spaties en kleine letters zijn presentatie; alleen de tekens tellen.
  it('haalt opmaak weg en maakt er hoofdletters van', () => {
    expect(normalizeCode('abcde-fghjk')).toBe('ABCDEFGHJK')
    expect(normalizeCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK')
    expect(normalizeCode('ABCDE—FGHJK')).toBe('ABCDEFGHJK')
  })

  it('is stabiel als je hem twee keer toepast', () => {
    expect(normalizeCode(normalizeCode('abcde-fghjk'))).toBe('ABCDEFGHJK')
  })
})

describe('formatCode', () => {
  it('zet een streepje in het midden van een volledige code', () => {
    expect(formatCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
    expect(formatCode('abcde-fghjk')).toBe('ABCDE-FGHJK')
  })

  // Half getypte invoer mag niet ineens een streepje krijgen; dat leest als een
  // fout in wat de gebruiker net intikte.
  it('laat een onvolledige code met rust', () => {
    expect(formatCode('ABCDE')).toBe('ABCDE')
    expect(formatCode('')).toBe('')
  })
})

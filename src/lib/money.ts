/**
 * Geld, in hele centen.
 *
 * Er was nul geldprecedent in deze codebase, en de enige decimaal-precedent
 * (formatPoints in Potjescup) gebruikt een decimaal*punt*. Zonder deze module
 * wordt dit in vier componenten opnieuw en net iets anders bedacht.
 *
 * Alles is integer: geen NUMERIC, geen float. Een cent die zoekraakt in een
 * splitsing is precies het soort fout dat pas maanden later opvalt, in een
 * discussie over de bierpot.
 */

/**
 * Accepteert "12,50", "12.50", "€ 12,50", "1.234,56" en "12".
 *
 * De Nederlandse notatie gebruikt de punt als duizendtalscheiding en de komma als
 * decimaal, terwijl mensen ook gewoon "12.50" typen. De regel: is er een komma,
 * dan is die de decimaal en zijn punten duizendtallen. Is er geen komma, dan is
 * een punt de decimaal — mits er precies twee cijfers achter staan, anders is het
 * óók een duizendtalscheiding.
 *
 * Gevolg, en dat is bewust: "1.005" wordt € 1005 en niet € 1,005. In Nederlandse
 * notatie is dat de juiste lezing, en een half-cent-bedrag bestaat hier toch niet.
 */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/^€\s*/, '').replace(/\s/g, '')
  if (s === '') return null
  if (!/^[0-9.,]+$/.test(s)) return null

  let normalized: string
  if (s.includes(',')) {
    if ((s.match(/,/g) || []).length > 1) return null
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else {
    const punten = (s.match(/\./g) || []).length
    if (punten === 0) {
      normalized = s
    } else if (punten === 1 && /\.\d{2}$/.test(s)) {
      normalized = s
    } else {
      // "1.234" of "1.234.567" — duizendtallen, geen decimaal.
      normalized = s.replace(/\./g, '')
    }
  }

  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  // Afronden en niet afkappen, met een epsilon tegen de klassieke
  // 1.005 * 100 = 100.49999999999999. Zonder dat verdwijnt er af en toe een cent.
  return Math.round(n * 100 + Number.EPSILON * 100)
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
    .format(cents / 100)
}

/** Zonder euroteken, voor invoervelden. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

/**
 * Verdeelt een bedrag cent-exact over spelers.
 *
 * `base = floor(total / n)`, en de eerste `rest` spelers (gesorteerd op id, dus
 * deterministisch) krijgen één cent extra. € 10 over 3 wordt 334/333/333 en nooit
 * 333/333/333 met een zoekgeraakte cent.
 *
 * De uitkomst wordt als rijen opgeslagen en nooit opnieuw berekend: anders
 * herschrijft een vertrekkende speler stil de geschiedenis.
 */
export function splitCents(total: number, playerIds: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  const n = playerIds.length
  if (n === 0 || total <= 0) return out

  const gesorteerd = [...playerIds].sort()
  const base = Math.floor(total / n)
  const rest = total - base * n

  gesorteerd.forEach((id, i) => {
    out[id] = base + (i < rest ? 1 : 0)
  })
  return out
}

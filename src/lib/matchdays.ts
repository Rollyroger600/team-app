/** Wat nextMatchday() van een poulewedstrijd nodig heeft. */
export interface MatchdayLike {
  matchday: number | null
  match_date: string | null
}

/**
 * De speelronde die "Wedstrijden invoeren" bij openen toont: de eerstvolgende.
 *
 * Een ronde telt als eerstvolgend zodra zijn **vroegste** datum vandaag of later
 * is. Bewust de vroegste en niet de laatste: een ronde waarvan één wedstrijd is
 * verplaatst naar later in het seizoen zou anders weken blijven hangen als
 * "eerstvolgend", terwijl de rest allang gespeeld is.
 *
 * Vangnetten, in volgorde:
 * 1. de laagste ronde waarvan de vroegste datum >= vandaag is;
 * 2. anders de laagste ronde zonder enige datum -- die moet nog ingepland;
 * 3. anders de hoogste ronde (einde seizoen: laat het laatste zien, niet R1);
 * 4. anders 1 (nog helemaal geen wedstrijden).
 *
 * `today` is een lokale YYYY-MM-DD. Geef die mee via toISODate(new Date()), niet
 * via toISOString() -- dat is UTC en loopt tussen middernacht en 02:00 een dag
 * achter.
 */
export function nextMatchday(matches: MatchdayLike[], today: string): number {
  const vroegste: Record<number, string | null> = {}
  for (const m of matches) {
    if (m.matchday == null) continue
    if (!(m.matchday in vroegste)) vroegste[m.matchday] = null
    if (m.match_date) {
      const d = m.match_date.slice(0, 10)
      const huidig = vroegste[m.matchday]
      if (huidig === null || d < huidig) vroegste[m.matchday] = d
    }
  }

  const rondes = Object.keys(vroegste).map(Number).sort((a, b) => a - b)
  if (rondes.length === 0) return 1

  const komend = rondes.find(r => vroegste[r] !== null && vroegste[r]! >= today)
  if (komend !== undefined) return komend

  const ongepland = rondes.find(r => vroegste[r] === null)
  if (ongepland !== undefined) return ongepland

  return rondes[rondes.length - 1]
}

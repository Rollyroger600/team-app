import type { TeamMembership } from '../types/app'

// Zelfde opzet als de thema-keuze (src/lib/theme.ts): de keuze staat in localStorage,
// niet in de database, zodat hij een refresh overleeft zonder extra query.
const STORAGE_KEY = 'activeTeamId'

export function readStoredTeamId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Safari private mode gooit hier; dan valt resolveActiveMembership() gewoon terug
    // op de eerste actieve membership.
    return null
  }
}

export function storeActiveTeamId(teamId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, teamId)
  } catch {
    // Niet kunnen onthouden is vervelend, niet fataal — negeren.
  }
}

/**
 * Kiest welke membership het actieve team wordt.
 *
 * Vóór 2026-08-20 was dit overal simpelweg `memberships[0]`, terwijl de query geen
 * ORDER BY en geen active-filter had. Postgres geeft dan rijen in fysieke volgorde
 * terug, die na élke UPDATE kan verschuiven — met twee memberships kon het actieve
 * team dus stil omklappen tussen sessies. De aanroepende query sorteert nu op
 * joined_at en filtert op active; deze functie legt daar de onthouden keuze overheen.
 */
export function resolveActiveMembership(memberships: TeamMembership[]): TeamMembership | null {
  if (memberships.length === 0) return null

  const storedId = readStoredTeamId()
  if (storedId) {
    const stored = memberships.find(m => m.team_id === storedId)
    if (stored) return stored
    // Onthouden team bestaat niet meer (of je bent eruit gehaald) — val stil terug.
  }
  return memberships[0]
}

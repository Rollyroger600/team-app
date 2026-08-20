import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'

/**
 * Rechtenchecks tegen het teám dat je nu bekijkt, niet tegen "een team ergens".
 *
 * Waarom dit bestaat: `isAnyTeamAdmin()` stond op acht plekken en kijkt naar álle
 * memberships tegelijk. Met één team is dat hetzelfde antwoord, maar zodra iemand in
 * twee teams zit betekent het: beheerder van team B krijgt beheerdersknoppen te zien
 * terwijl hij naar team A kijkt. De writes worden dan door RLS geweigerd en de speler
 * krijgt een rauwe Postgres-fout in beeld — het ergst in TeamAvailabilityList, waar de
 * statuskiezer van een teamgenoot openklapt.
 *
 * Beide hooks vallen door naar platform_admin, precies zoals de SQL-functies
 * is_team_admin()/is_team_owner() en de edge function dat doen. Dit is UX-afscherming;
 * RLS en de DB-triggers blijven de echte handhaving.
 */

/** Beheerder (of Hoofdbeheerder, of platform-admin) van het actieve team. */
export function useIsTeamAdmin(): boolean {
  const { isTeamAdmin, isPlatformAdmin } = useAuthStore()
  const { activeTeam } = useTeamStore()
  if (isPlatformAdmin()) return true
  return !!activeTeam?.id && isTeamAdmin(activeTeam.id)
}

/** Alleen Hoofdbeheerder (of platform-admin) van het actieve team. */
export function useIsTeamOwner(): boolean {
  const { isTeamOwner, isPlatformAdmin } = useAuthStore()
  const { activeTeam } = useTeamStore()
  if (isPlatformAdmin()) return true
  return !!activeTeam?.id && isTeamOwner(activeTeam.id)
}

import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'
import useTeamStore from '../../stores/useTeamStore'
import { useIsTeamAdmin } from '../../lib/permissions'
import PageLoader from '../ui/PageLoader'

/**
 * Gate voor het hele /admin-gebied, gebonden aan het ACTIEVE team.
 *
 * Was `isAnyTeamAdmin()`: beheerder-zijn van wélk team dan ook opende /admin voor het
 * team dat je op dat moment bekeek. Met één team hetzelfde antwoord, met twee teams een
 * scherm vol knoppen die RLS vervolgens weigert. Zie src/lib/permissions.ts.
 */
export default function AdminRoute() {
  const { profileLoaded } = useAuthStore()
  const { activeTeam } = useTeamStore()
  const isTeamAdmin = useIsTeamAdmin()

  // Wachten tot zowel het profiel als het actieve team geladen zijn — anders is
  // activeTeam nog null en zou een echte beheerder één frame lang weggestuurd worden.
  if (!profileLoaded || !activeTeam) return <PageLoader />
  if (!isTeamAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

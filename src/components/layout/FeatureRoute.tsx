import { Navigate, Outlet } from 'react-router-dom'
import useTeamStore from '../../stores/useTeamStore'
import PageLoader from '../ui/PageLoader'
import type { BooleanSettingKey } from '../../types/app'

interface FeatureRouteProps {
  flag: BooleanSettingKey
}

/**
 * Route-level guard for a per-team feature toggle — same shape as AdminRoute, but
 * gated on TeamSettings instead of a role. Hiding the nav item (BottomNav.tsx,
 * More.tsx) is a UX nicety, not enforcement: this is what actually blocks a direct
 * URL visit (e.g. a bookmarked /potjescup) once a team switches the feature off.
 */
export default function FeatureRoute({ flag }: FeatureRouteProps) {
  const { teamSettings, settingsLoaded } = useTeamStore()

  // teamSettings staat default op "alles aan", dus zonder deze guard flitst een
  // uitgeschakelde pagina één frame in beeld voordat de redirect volgt. Nu onzichtbaar
  // (er is één team), zichtbaar zodra je van team kunt wisselen.
  if (!settingsLoaded) return <PageLoader />
  if (!teamSettings[flag]) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

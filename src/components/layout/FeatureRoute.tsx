import { Navigate, Outlet } from 'react-router-dom'
import useTeamStore from '../../stores/useTeamStore'
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
  const { teamSettings } = useTeamStore()

  if (!teamSettings[flag]) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

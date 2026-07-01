import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'
import PageLoader from '../ui/PageLoader'

export default function AdminRoute() {
  const { isAnyTeamAdmin, isPlatformAdmin, isClubAdmin, profileLoaded } = useAuthStore()

  if (!profileLoaded) return <PageLoader />
  if (!isAnyTeamAdmin() && !isPlatformAdmin() && !isClubAdmin()) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

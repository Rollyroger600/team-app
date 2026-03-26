import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'

export default function AdminRoute() {
  const { isAnyTeamAdmin, isPlatformAdmin, isClubAdmin } = useAuthStore()

  if (!isAnyTeamAdmin() && !isPlatformAdmin() && !isClubAdmin()) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

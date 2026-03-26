import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'

export default function AdminRoute() {
  const { isAnyTeamAdmin, isPlatformAdmin } = useAuthStore()

  if (!isAnyTeamAdmin() && !isPlatformAdmin()) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

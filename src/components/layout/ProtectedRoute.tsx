import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../stores/useAuthStore'

export default function ProtectedRoute() {
  const { user, initialized } = useAuthStore()

  if (!initialized) return null
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

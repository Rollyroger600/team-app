import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import useAuthStore from './stores/useAuthStore'
import useTeamStore from './stores/useTeamStore'
import AppShell from './components/layout/AppShell'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AdminRoute from './components/layout/AdminRoute'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Matches from './pages/Matches'
import MatchDetail from './pages/MatchDetail'
import MatchLineup from './pages/MatchLineup'
import Standings from './pages/Standings'
import Stats from './pages/Stats'
import Umpire from './pages/Umpire'
import Announcements from './pages/Announcements'
import Settings from './pages/Settings'
import More from './pages/More'

// Dev tools
import DevSwitcher from './components/dev/DevSwitcher'

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminPlayers from './pages/admin/AdminPlayers'
import AdminMatchEdit from './pages/admin/AdminMatchEdit'
import AdminRoster from './pages/admin/AdminRoster'
import AdminLeague from './pages/admin/AdminLeague'
import AdminLeagueMatches from './pages/admin/AdminLeagueMatches'
import AdminLeagueResults from './pages/admin/AdminLeagueResults'
import AdminUmpire from './pages/admin/AdminUmpire'
import AdminMatchGoals from './pages/admin/AdminMatchGoals'
import AdminAnnouncements from './pages/admin/AdminAnnouncements'
import AdminTeamSettings from './pages/admin/AdminTeamSettings'
import AdminRoles from './pages/admin/AdminRoles'
import Debug from './pages/Debug'

export default function App() {
  const { initialize, loading, initialized, memberships } = useAuthStore()
  const { setActiveTeam } = useTeamStore()

  useEffect(() => {
    initialize()
  }, [])

  useEffect(() => {
    if (memberships.length > 0) {
      const firstMembership = memberships[0]
      setActiveTeam(firstMembership.teams as Parameters<typeof setActiveTeam>[0], firstMembership.teams?.clubs as Parameters<typeof setActiveTeam>[1])
    }
  }, [memberships])

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-secondary)' }} />
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/debug" element={<Debug />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/matches/:id" element={<MatchDetail />} />
            <Route path="/matches/:id/lineup" element={<MatchLineup />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/umpire" element={<Umpire />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/more" element={<More />} />
            <Route path="/settings" element={<Settings />} />

            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/players" element={<AdminPlayers />} />
              <Route path="/admin/matches/new" element={<AdminMatchEdit />} />
              <Route path="/admin/matches/:id/edit" element={<AdminMatchEdit />} />
              <Route path="/admin/matches/:id/roster" element={<AdminRoster />} />
              <Route path="/admin/matches/:id/goals" element={<AdminMatchGoals />} />
              <Route path="/admin/league" element={<AdminLeague />} />
              <Route path="/admin/league/matches" element={<AdminLeagueMatches />} />
              <Route path="/admin/league/results" element={<AdminLeagueResults />} />
              <Route path="/admin/umpire" element={<AdminUmpire />} />
              <Route path="/admin/announcements/new" element={<AdminAnnouncements />} />
              <Route path="/admin/settings" element={<AdminTeamSettings />} />
              <Route path="/admin/roles" element={<AdminRoles />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DevSwitcher />
    </BrowserRouter>
    </QueryClientProvider>
  )
}

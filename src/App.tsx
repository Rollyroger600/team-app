import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import useAuthStore from './stores/useAuthStore'
import useTeamStore from './stores/useTeamStore'
import { resolveActiveMembership } from './lib/activeTeam'
import AppShell from './components/layout/AppShell'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AdminRoute from './components/layout/AdminRoute'
import FeatureRoute from './components/layout/FeatureRoute'
import PageLoader from './components/ui/PageLoader'

// Pages — lazy-loaded so a visit only downloads the page actually opened
// (the whole app used to ship as one ~650KB bundle; see CLAUDE.md).
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Matches = lazy(() => import('./pages/Matches'))
const MatchDetail = lazy(() => import('./pages/MatchDetail'))
const MatchLineup = lazy(() => import('./pages/MatchLineup'))
const Potjescup = lazy(() => import('./pages/Potjescup'))
const Stats = lazy(() => import('./pages/Stats'))
const Umpire = lazy(() => import('./pages/Umpire'))
const Announcements = lazy(() => import('./pages/Announcements'))
const Settings = lazy(() => import('./pages/Settings'))
const More = lazy(() => import('./pages/More'))

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminPlayers = lazy(() => import('./pages/admin/AdminPlayers'))
const AdminMatchEdit = lazy(() => import('./pages/admin/AdminMatchEdit'))
const AdminRoster = lazy(() => import('./pages/admin/AdminRoster'))
const AdminLeague = lazy(() => import('./pages/admin/AdminLeague'))
const AdminLeagueMatches = lazy(() => import('./pages/admin/AdminLeagueMatches'))
const AdminLeagueResults = lazy(() => import('./pages/admin/AdminLeagueResults'))
const AdminUmpire = lazy(() => import('./pages/admin/AdminUmpire'))
const AdminAttendance = lazy(() => import('./pages/admin/AdminAttendance'))
const AdminPotjescup = lazy(() => import('./pages/admin/AdminPotjescup'))
const AdminMatchGoals = lazy(() => import('./pages/admin/AdminMatchGoals'))
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'))
const AdminTeamSettings = lazy(() => import('./pages/admin/AdminTeamSettings'))
const Debug = lazy(() => import('./pages/Debug'))

export default function App() {
  const { initialize, loading, initialized, memberships } = useAuthStore()
  const { setActiveTeam } = useTeamStore()

  useEffect(() => {
    initialize()
  }, [])

  useEffect(() => {
    const active = resolveActiveMembership(memberships)
    if (active) {
      setActiveTeam(active.teams as Parameters<typeof setActiveTeam>[0], active.teams?.clubs as Parameters<typeof setActiveTeam>[1])
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
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/debug" element={<Debug />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/matches/:id" element={<MatchDetail />} />
            <Route path="/matches/:id/lineup" element={<MatchLineup />} />
            <Route element={<FeatureRoute flag="potjescup_enabled" />}>
              <Route path="/potjescup" element={<Potjescup />} />
            </Route>
            <Route path="/stats" element={<Stats />} />
            <Route element={<FeatureRoute flag="fluitbeurten_enabled" />}>
              <Route path="/umpire" element={<Umpire />} />
            </Route>
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
              <Route path="/admin/attendance" element={<AdminAttendance />} />
              <Route path="/admin/potjescup" element={<AdminPotjescup />} />
              <Route path="/admin/announcements/new" element={<AdminAnnouncements />} />
              <Route path="/admin/settings" element={<AdminTeamSettings />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    </QueryClientProvider>
  )
}

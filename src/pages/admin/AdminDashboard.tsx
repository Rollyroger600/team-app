import React from 'react'
import { Link } from 'react-router-dom'
import { Users, Calendar, Trophy, Flag, MessageSquare, Settings, BarChart2, PlusCircle, LogOut, Medal, CalendarClock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'

interface AdminSection {
  title: string
  description: string
  icon: LucideIcon
  to: string
  color: string
}

const adminSections: AdminSection[] = [
  {
    title: 'Uitslagen invoeren',
    description: 'Competitie scores',
    icon: BarChart2,
    to: '/admin/league/results',
    color: 'bg-pink-500/20 text-pink-400',
  },
  {
    title: 'Potjescup',
    description: 'Trainingspotjes en punten bijhouden',
    icon: Medal,
    to: '/admin/potjescup',
    color: 'bg-warning/20 text-warning',
  },
  {
    title: 'Aanwezigheid',
    description: 'Overzicht per speler, per wedstrijd',
    icon: CalendarClock,
    to: '/admin/attendance',
    color: 'bg-cyan-500/20 text-cyan-400',
  },
  {
    title: 'Bericht plaatsen',
    description: 'Aankondigingen versturen',
    icon: MessageSquare,
    to: '/admin/announcements/new',
    color: 'bg-teal-500/20 text-teal-400',
  },
  {
    title: 'Spelers',
    description: 'Beheer spelerslijst en rollen',
    icon: Users,
    to: '/admin/players',
    color: 'bg-info/20 text-info',
  },
  {
    title: 'Wedstrijd toevoegen',
    description: 'Nieuwe wedstrijd plannen',
    icon: PlusCircle,
    to: '/admin/matches/new',
    color: 'bg-available/20 text-success',
  },
  {
    title: 'Competitie',
    description: 'Competitie en teams beheren',
    icon: Trophy,
    to: '/admin/league',
    color: 'bg-secondary/20 text-secondary-soft',
  },
  {
    title: 'Comp. wedstrijden',
    description: 'Wedstrijden importeren',
    icon: Calendar,
    to: '/admin/league/matches',
    color: 'bg-purple-500/20 text-purple-400',
  },
  {
    title: 'Fluitbeurten',
    description: 'Umpire schema beheren',
    icon: Flag,
    to: '/admin/umpire',
    color: 'bg-orange-500/20 text-orange-400',
  },
  {
    title: 'Team instellingen',
    description: 'Team configuratie aanpassen',
    icon: Settings,
    to: '/admin/settings',
    color: 'bg-text-subtle/20 text-text-muted',
  },
]

export default function AdminDashboard(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const { user, profile, signOut } = useAuthStore()

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header met profiel + logout */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Beheer</p>
          <h1 className="text-2xl font-bold">Admin</h1>
          {activeTeam && <p className="text-text-muted text-sm">{activeTeam.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{profile?.full_name || user?.email}</p>
          </div>
          <button
            onClick={signOut}
            title="Uitloggen"
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-unavailable/10 hover:border-unavailable/40 hover:text-danger transition-all border-border text-text-muted"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {adminSections.map(({ title, description, icon: Icon, to, color }) => (
          <Link
            key={to}
            to={to}
            className="rounded-xl p-4 border transition-colors hover:border-border-hover flex flex-col gap-3 bg-surface border-border"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-text-muted mt-0.5">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

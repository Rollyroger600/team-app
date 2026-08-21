import React from 'react'
import { Link } from 'react-router-dom'
import { Users, Calendar, Trophy, Flag, MessageSquare, Settings, BarChart2, PlusCircle, LogOut, Medal, CalendarClock, Dumbbell } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'
import { useIsTeamOwner } from '../../lib/permissions'
import type { BooleanSettingKey } from '../../types/app'

interface AdminSection {
  title: string
  description: string
  icon: LucideIcon
  to: string
  // Icon chip. Colours come from --color-* tokens only; a raw Tailwind class
  // (text-pink-400 and friends) only looks right in one of the three themes.
  // chart-1..5 are the app's five neutral hues -- reused here because the tiles
  // need exactly that: distinguishable, theme-aware, and not status colours.
  color: string
  // Hide the tile when this team setting is off. Same mechanism as BottomNav's
  // navItems[].flag and More.tsx's tab array.
  flag?: BooleanSettingKey
  // Hoofdbeheerder-only. Matches what the enforce_team_owner_only_settings
  // trigger enforces server-side -- this only removes the tile.
  ownerOnly?: boolean
}

const adminSections: AdminSection[] = [
  {
    title: 'Uitslagen invoeren',
    description: 'Competitie scores',
    icon: BarChart2,
    to: '/admin/league/results',
    color: 'bg-chart-5/20 text-chart-5',
    flag: 'competitie_enabled',
  },
  {
    title: 'Potjescup',
    description: 'Trainingspotjes en punten bijhouden',
    icon: Medal,
    to: '/admin/potjescup',
    color: 'bg-warning/20 text-warning',
    flag: 'potjescup_enabled',
  },
  {
    title: 'Trainingen',
    description: 'Schema genereren en beheren',
    icon: Dumbbell,
    to: '/admin/trainings',
    color: 'bg-chart-3/20 text-chart-3',
    flag: 'trainingen_enabled',
  },
  {
    title: 'Aanwezigheid',
    description: 'Overzicht per speler, per wedstrijd',
    icon: CalendarClock,
    to: '/admin/attendance',
    color: 'bg-chart-3/20 text-chart-3',
  },
  {
    title: 'Bericht plaatsen',
    description: 'Aankondigingen versturen',
    icon: MessageSquare,
    to: '/admin/announcements/new',
    color: 'bg-chart-4/20 text-chart-4',
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
    flag: 'competitie_enabled',
  },
  {
    title: 'Comp. wedstrijden',
    description: 'Wedstrijden importeren',
    icon: Calendar,
    to: '/admin/league/matches',
    color: 'bg-chart-1/20 text-chart-1',
    flag: 'competitie_enabled',
  },
  {
    title: 'Fluitbeurten',
    description: 'Umpire schema beheren',
    icon: Flag,
    to: '/admin/umpire',
    color: 'bg-chart-2/20 text-chart-2',
    flag: 'fluitbeurten_enabled',
  },
  {
    title: 'Team instellingen',
    description: 'Team configuratie aanpassen',
    icon: Settings,
    to: '/admin/settings',
    color: 'bg-text-subtle/20 text-text-muted',
    ownerOnly: true,
  },
]

export default function AdminDashboard(): React.JSX.Element {
  const { activeTeam, teamSettings } = useTeamStore()
  const { user, profile, signOut } = useAuthStore()
  const isOwner = useIsTeamOwner()

  const sections = adminSections.filter(
    (s) => (!s.flag || teamSettings[s.flag]) && (!s.ownerOnly || isOwner)
  )

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
        {sections.map(({ title, description, icon: Icon, to, color }) => (
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

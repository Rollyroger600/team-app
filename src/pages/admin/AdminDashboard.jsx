import { Link } from 'react-router-dom'
import { Users, Calendar, Trophy, Flag, MessageSquare, Settings, BarChart2, PlusCircle, LogOut, Target } from 'lucide-react'
import useTeamStore from '../../stores/useTeamStore'
import useAuthStore from '../../stores/useAuthStore'

const adminSections = [
  {
    title: 'Spelers',
    description: 'Beheer spelerslijst en rollen',
    icon: Users,
    to: '/admin/players',
    color: 'bg-blue-500/20 text-blue-400',
  },
  {
    title: 'Wedstrijd toevoegen',
    description: 'Nieuwe wedstrijd plannen',
    icon: PlusCircle,
    to: '/admin/matches/new',
    color: 'bg-green-500/20 text-green-400',
  },
  {
    title: 'Competitie',
    description: 'Competitie en teams beheren',
    icon: Trophy,
    to: '/admin/league',
    color: 'bg-amber-500/20 text-amber-400',
  },
  {
    title: 'Comp. wedstrijden',
    description: 'Wedstrijden importeren',
    icon: Calendar,
    to: '/admin/league/matches',
    color: 'bg-purple-500/20 text-purple-400',
  },
  {
    title: 'Uitslagen invoeren',
    description: 'Competitie scores',
    icon: BarChart2,
    to: '/admin/league/results',
    color: 'bg-pink-500/20 text-pink-400',
  },
  {
    title: 'Doelpunten & kaarten',
    description: 'Goals en kaarten per match',
    icon: Target,
    to: '/matches',
    color: 'bg-red-500/20 text-red-400',
    note: 'via wedstrijd',
  },
  {
    title: 'Fluitbeurten',
    description: 'Umpire schema beheren',
    icon: Flag,
    to: '/admin/umpire',
    color: 'bg-orange-500/20 text-orange-400',
  },
  {
    title: 'Bericht plaatsen',
    description: 'Aankondigingen versturen',
    icon: MessageSquare,
    to: '/admin/announcements/new',
    color: 'bg-teal-500/20 text-teal-400',
  },
  {
    title: 'Team instellingen',
    description: 'Team configuratie aanpassen',
    icon: Settings,
    to: '/admin/settings',
    color: 'bg-slate-500/20 text-slate-400',
  },
]

export default function AdminDashboard() {
  const { activeTeam } = useTeamStore()
  const { user, profile, signOut } = useAuthStore()

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Header met profiel + logout */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Beheer</p>
          <h1 className="text-2xl font-bold">Admin</h1>
          {activeTeam && <p className="text-slate-400 text-sm">{activeTeam.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{profile?.full_name || user?.email}</p>
          </div>
          <button
            onClick={signOut}
            title="Uitloggen"
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
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
            className="rounded-xl p-4 border transition-colors hover:border-slate-500 flex flex-col gap-3"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

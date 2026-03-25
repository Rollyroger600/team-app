import { NavLink } from 'react-router-dom'
import { Home, Calendar, Trophy, BarChart2, MoreHorizontal } from 'lucide-react'
import useAuthStore from '../../stores/useAuthStore'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/matches', icon: Calendar, label: 'Wedstrijden' },
  { to: '/standings', icon: Trophy, label: 'Stand' },
  { to: '/stats', icon: BarChart2, label: 'Stats' },
]

export default function BottomNav() {
  const { isAnyTeamAdmin, isPlatformAdmin } = useAuthStore()
  const isAdmin = isAnyTeamAdmin() || isPlatformAdmin()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-surface border-border">
      <div className="flex items-stretch h-16 max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                isActive
                  ? 'text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/more"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
              isActive
                ? 'text-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <MoreHorizontal size={20} />
          <span>Meer</span>
        </NavLink>
      </div>
    </nav>
  )
}

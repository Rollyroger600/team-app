import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import GatheringBanner from './GatheringBanner'
import TeamSwitcher from './TeamSwitcher'

export default function AppShell() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <GatheringBanner />
      {/* Rendert alleen bij meer dan een lidmaatschap; anders verandert er niets. */}
      <TeamSwitcher />
      <main className="flex-1 pb-20 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}

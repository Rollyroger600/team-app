import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import GatheringBanner from './GatheringBanner'

export default function AppShell() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <GatheringBanner />
      <main className="flex-1 pb-20 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}

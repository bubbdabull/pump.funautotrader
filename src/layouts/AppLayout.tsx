import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopNavbar } from '@/components/layout/TopNavbar'
import { MobileNav } from '@/components/layout/MobileNav'
import { AutoTradePanel } from '@/components/autotrade/AutoTradePanel'
import { useAppStore } from '@/stores/appStore'

export function AppLayout() {
  const { autoTradePanelOpen } = useAppStore()
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-3 pb-20 lg:p-6 lg:pb-6">
            <Outlet />
          </main>
          {autoTradePanelOpen && (
            <div className="hidden border-l border-white/5 xl:block">
              <AutoTradePanel />
            </div>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  )
}

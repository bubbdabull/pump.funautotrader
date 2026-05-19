import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopNavbar } from '@/components/layout/TopNavbar'
import { AutoTradePanel } from '@/components/autotrade/AutoTradePanel'
import { useAppStore } from '@/stores/appStore'

export function AppLayout() {
  const { autoTradePanelOpen } = useAppStore()
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
            <Outlet />
          </main>
          {autoTradePanelOpen && <AutoTradePanel />}
        </div>
      </div>
    </div>
  )
}

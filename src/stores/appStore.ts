import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  sidebarCollapsed: boolean
  autoTradePanelOpen: boolean
  watchlist: string[]
  toggleSidebar: () => void
  toggleAutoTradePanel: () => void
  setAutoTradePanelOpen: (open: boolean) => void
  toggleWatchlist: (mint: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      autoTradePanelOpen: true,
      watchlist: [],
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      toggleAutoTradePanel: () => set({ autoTradePanelOpen: !get().autoTradePanelOpen }),
      setAutoTradePanelOpen: (open) => set({ autoTradePanelOpen: open }),
      toggleWatchlist: (mint) => {
        const list = get().watchlist
        set({
          watchlist: list.includes(mint) ? list.filter((m) => m !== mint) : [...list, mint],
        })
      },
    }),
    { name: 'phronis-app' },
  ),
)

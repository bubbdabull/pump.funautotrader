import { Search, Bell, User } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Input } from '@/components/ui/input'
import { useAlerts, useUnreadAlertCount } from '@/hooks/useAlerts'
import { shortenAddress } from '@/lib/utils'
import { useAppStore } from '@/stores/appStore'
import { useAutoTraderStore } from '@/stores/autoTraderStore'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { cn } from '@/lib/utils'

export function TopNavbar() {
  const { publicKey } = useWallet()
  const { toggleAutoTradePanel } = useAppStore()
  const enabled = useAutoTraderStore((s) => s.rules.enabled)
  const { data: alerts } = useAlerts()
  const unread = useUnreadAlertCount(alerts)
  const backend = useBackendStatus()

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-white/5 glass px-6">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Search tokens by mint or symbol..."
          className="pl-10 bg-white/[0.03]"
        />
      </div>

      <span
        className={cn(
          'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium md:flex',
          backend.socketConnected
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-400',
        )}
        title={backend.statusLine}
      >
        <span className="relative flex h-1.5 w-1.5">
          {backend.socketConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
          )}
          <span
            className={cn(
              'relative h-1.5 w-1.5 rounded-full',
              backend.socketConnected ? 'bg-emerald-400' : 'bg-amber-400',
            )}
          />
        </span>
        {backend.socketConnected ? 'Stream' : backend.apiReachable ? 'API only' : 'Offline'}
      </span>

      {enabled && (
        <span className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Auto-trading
        </span>
      )}

      <button
        onClick={toggleAutoTradePanel}
        className="text-xs text-zinc-500 hover:text-teal-400"
      >
        Auto panel
      </button>

      <button className="relative rounded-lg p-2 text-zinc-400 hover:bg-white/5">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-[10px] text-white">
            {unread}
          </span>
        )}
      </button>

      <WalletMultiButton />

      <button className="flex items-center gap-2 rounded-lg border border-white/5 p-1.5 pr-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600/20">
          <User className="h-4 w-4 text-teal-300" />
        </div>
        <span className="hidden text-xs text-zinc-400 lg:block">
          {publicKey ? shortenAddress(publicKey.toBase58(), 6) : 'Guest'}
        </span>
      </button>
    </header>
  )
}

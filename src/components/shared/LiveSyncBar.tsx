import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useLiveTick, secondsSince } from '@/hooks/useLiveTick'
import { cn } from '@/lib/utils'

interface LiveSyncBarProps {
  wsConnected?: boolean
  dataUpdatedAt?: number
  isFetching?: boolean
  activeCount?: number
  totalCount?: number
  className?: string
}

export function LiveSyncBar({
  wsConnected = false,
  dataUpdatedAt = 0,
  isFetching = false,
  activeCount,
  totalCount,
  className,
}: LiveSyncBarProps) {
  useLiveTick()
  const ago = dataUpdatedAt > 0 ? secondsSince(dataUpdatedAt) : null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px]',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-medium',
          wsConnected ? 'text-emerald-400' : 'text-amber-400',
        )}
      >
        {wsConnected ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            Reconnecting
          </>
        )}
      </span>

      {activeCount != null && totalCount != null && (
        <span className="tabular-nums text-cyan-400/90">
          {activeCount}/{totalCount} active
        </span>
      )}

      {ago != null && (
        <span className="text-zinc-500">
          sync {ago}s ago
          {isFetching && (
            <RefreshCw className="ml-1 inline h-3 w-3 animate-spin text-violet-400" />
          )}
        </span>
      )}

      {wsConnected && (
        <Wifi className="ml-auto h-3 w-3 text-zinc-600" aria-hidden />
      )}
    </div>
  )
}

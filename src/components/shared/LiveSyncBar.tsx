import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useLiveTick, secondsSince } from '@/hooks/useLiveTick'
import { cn } from '@/lib/utils'

export type LiveStreamMode = 'ws' | 'rest' | 'connecting'

interface LiveSyncBarProps {
  /** Socket.IO connected to Fly API */
  wsConnected?: boolean
  /** REST fallback polling when WS is down */
  restSync?: boolean
  dataUpdatedAt?: number
  isFetching?: boolean
  /** Tokens with a trade in the last ~2m */
  hotCount?: number
  totalCount?: number
  className?: string
}

function resolveStreamMode(wsConnected: boolean, restSync: boolean): LiveStreamMode {
  if (wsConnected) return 'ws'
  if (restSync) return 'rest'
  return 'connecting'
}

export function LiveSyncBar({
  wsConnected = false,
  restSync = false,
  dataUpdatedAt = 0,
  isFetching = false,
  hotCount,
  totalCount,
  className,
}: LiveSyncBarProps) {
  useLiveTick()
  const ago = dataUpdatedAt > 0 ? secondsSince(dataUpdatedAt) : null
  const mode = resolveStreamMode(wsConnected, restSync)
  const hasData = (totalCount ?? 0) > 0

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
          mode === 'ws' && 'text-emerald-400',
          mode === 'rest' && 'text-cyan-400',
          mode === 'connecting' && 'text-amber-400',
        )}
        title={
          mode === 'ws'
            ? 'Socket.IO stream from Fly API'
            : mode === 'rest'
              ? 'Fly API reachable; polling feed until Socket.IO connects'
              : 'Waiting for Fly API stream (check VITE_WS_URL on Vercel)'
        }
      >
        {mode === 'ws' ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </>
        ) : mode === 'rest' ? (
          <>
            <Wifi className="h-3 w-3" />
            API sync
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            {hasData ? 'Stream connecting…' : 'Reconnecting'}
          </>
        )}
      </span>

      {hotCount != null && totalCount != null && (
        <span className="tabular-nums text-cyan-400/90" title="Tokens with a trade in the last ~2 minutes">
          {hotCount}/{totalCount} hot
        </span>
      )}

      {ago != null && (
        <span className="text-zinc-500">
          updated {ago}s ago
          {isFetching && (
            <RefreshCw className="ml-1 inline h-3 w-3 animate-spin text-violet-400" />
          )}
        </span>
      )}

      {mode === 'ws' && (
        <Wifi className="ml-auto h-3 w-3 text-zinc-600" aria-hidden />
      )}
    </div>
  )
}

import { useMemo } from 'react'
import { useStreamStore } from '@/core/streamStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { cn } from '@/lib/utils'
import type { StreamDisplayMode } from '@/domain/tokens/tokenTypes'

export function TopStatusBar() {
  const connectionStatus = useStreamStore((s) => s.connectionStatus)
  const wsConnected = useStreamStore((s) => s.wsConnected)
  const version = useStreamStore((s) => s.version)
  const displayMode = useStreamStore((s) => s.displayMode)
  const setDisplayMode = useStreamStore((s) => s.setDisplayMode)
  const tokenCount = useStreamStore((s) => s.tokens.size)
  const updatedAt = useStreamStore((s) => s.updatedAt)
  const diagnostics = useRealtimeStore((s) => s.diagnostics)
  const streamHealth = useRealtimeStore((s) => s.streamHealth)

  const latencyMs = useMemo(() => {
    if (diagnostics.avgEventLatencyMs > 0) return diagnostics.avgEventLatencyMs
    if (updatedAt <= 0) return null
    return Math.max(0, Date.now() - updatedAt)
  }, [diagnostics.avgEventLatencyMs, updatedAt, version])

  const statusColor =
    connectionStatus === 'CONNECTED'
      ? 'bg-emerald-500'
      : connectionStatus === 'DEGRADED'
        ? 'bg-amber-500'
        : 'bg-red-500'

  return (
    <header className="desk-topbar flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-[#0a0b0f] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', statusColor, connectionStatus === 'CONNECTED' && 'terminal-heartbeat')} />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          {connectionStatus}
        </span>
        {wsConnected && latencyMs != null && (
          <span className="font-mono text-[10px] text-zinc-500">{latencyMs}ms lag</span>
        )}
      </div>

      <div className="font-mono text-[11px] text-zinc-400">
        <span className="text-zinc-500">Tokens</span>{' '}
        <span className="text-white">{tokenCount}</span>
        <span className="mx-2 text-zinc-700">|</span>
        <span className="text-zinc-500">Subs</span>{' '}
        <span className="text-white">
          {streamHealth.subscribedTradeMints}/{streamHealth.maxTradeSubscriptions}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {(['LIVE_STREAM', 'ANALYTICS_VIEW'] as StreamDisplayMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setDisplayMode(mode)}
            className={cn(
              'rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide',
              displayMode === mode
                ? 'bg-violet-600/40 text-violet-200'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
            )}
          >
            {mode === 'LIVE_STREAM' ? 'Live' : 'Analytics'}
          </button>
        ))}
      </div>
    </header>
  )
}

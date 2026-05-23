import { Activity, Radio, Wifi } from 'lucide-react'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useLiveTick, secondsSince } from '@/hooks/useLiveTick'
import { cn } from '@/lib/utils'
import type { ScannerLane } from '@/lib/feedQuality'

const LANES: { id: ScannerLane; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Hot' },
  { id: 'tradeable', label: 'Trade' },
  { id: 'alpha', label: 'Alpha' },
  { id: 'graduating', label: 'Grad' },
]

interface TerminalLiveStatusProps {
  lane: ScannerLane
  onLane: (lane: ScannerLane) => void
  wsConnected: boolean
  reconnecting: boolean
  tokenCount: number
  hotCount: number
  registryUpdatedAt: number
  className?: string
}

export function TerminalLiveStatus({
  lane,
  onLane,
  wsConnected,
  reconnecting,
  tokenCount,
  hotCount,
  registryUpdatedAt,
  className,
}: TerminalLiveStatusProps) {
  useLiveTick()
  const streamDebug = useRealtimeStore((s) => s.streamDebug)
  const diagnostics = useRealtimeStore((s) => s.diagnostics)
  const lagMs = streamDebug.ingestionLagMs || diagnostics.avgEventLatencyMs
  const ago = registryUpdatedAt > 0 ? secondsSince(registryUpdatedAt) : null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0c0e14]/90 px-3 py-2 backdrop-blur-md',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
          wsConnected && !reconnecting
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        )}
      >
        {wsConnected && !reconnecting ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="terminal-heartbeat absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </>
        ) : (
          <>
            <Activity className="h-3 w-3 animate-pulse" />
            SYNC
          </>
        )}
      </span>

      <div className="flex gap-0.5 rounded-lg border border-white/[0.06] bg-black/30 p-0.5">
        {LANES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onLane(l.id)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
              lane === l.id
                ? 'bg-violet-600/80 text-white'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <span className="font-mono text-[10px] text-zinc-500">
        <Radio className="mr-1 inline h-3 w-3 text-cyan-500/80" />
        {hotCount}/{tokenCount}
      </span>

      {ago != null && (
        <span className="text-[10px] text-zinc-600">
          upd <span className="font-mono text-zinc-500">{ago}s</span>
        </span>
      )}

      {lagMs > 0 && wsConnected && (
        <span
          className={cn(
            'font-mono text-[10px]',
            lagMs < 400 ? 'text-emerald-500/80' : lagMs < 1200 ? 'text-amber-400/80' : 'text-red-400/80',
          )}
        >
          {Math.round(lagMs)}ms
        </span>
      )}

      <Wifi className="ml-auto h-3.5 w-3.5 text-zinc-600" aria-hidden />
    </div>
  )
}

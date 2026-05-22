import { cn } from '@/lib/utils'
import { useLiveTick, secondsSince, formatSecondsAgo } from '@/hooks/useLiveTick'
import type { PumpToken } from '@/types'

interface TokenActivityBadgesProps {
  token: PumpToken
  compact?: boolean
}

export function ActivityPulse({ active }: { active?: boolean }) {
  if (!active) return null
  return (
    <span className="relative flex h-2 w-2 shrink-0" title="Trades in last 60s">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  )
}

export function TokenActivityBadges({ token, compact }: TokenActivityBadgesProps) {
  const tick = useLiveTick()
  const delta = token.mcapChange5m ?? 0
  const buy = token.buyPressure1m ?? 50
  const lastSec = secondsSince(token.lastTradeAt, tick)
  const last = lastSec != null ? formatSecondsAgo(lastSec) : null
  void tick

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <ActivityPulse active={token.isActive} />
        {last != null && <span className="text-[10px] tabular-nums text-zinc-500">{last}</span>}
        {token.trades1m != null && token.trades1m > 0 && (
          <span className="text-[10px] tabular-nums text-cyan-400/90">{token.trades1m}/m</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px]">
      <ActivityPulse active={token.isActive} />
      {last && (
        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 tabular-nums text-zinc-400">
          Last {last}
        </span>
      )}
      {token.trades1m != null && token.trades1m > 0 && (
        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 tabular-nums text-cyan-300">
          {token.trades1m} tx/min
        </span>
      )}
      <span
        className={cn(
          'rounded px-1.5 py-0.5 font-mono tabular-nums',
          delta >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
        )}
      >
        {delta >= 0 ? '+' : ''}
        {delta.toFixed(1)}% 5m
      </span>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 tabular-nums',
          buy >= 55 ? 'bg-emerald-500/10 text-emerald-300' : buy <= 45 ? 'bg-red-500/10 text-red-300' : 'bg-zinc-500/10 text-zinc-400',
        )}
      >
        Buy {buy}%
      </span>
    </div>
  )
}

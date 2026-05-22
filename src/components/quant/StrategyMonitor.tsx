import { Zap } from 'lucide-react'
import { useQuantStore } from '@/stores/quantStore'
import { Link } from 'react-router-dom'

const LABELS: Record<string, string> = {
  early_momentum: 'Early momentum',
  liquidity_expansion: 'Liquidity expansion',
  migration: 'Migration',
  smart_money_follow: 'Smart money',
  mean_reversion_scalp: 'Mean reversion',
}

export function StrategyMonitor() {
  const strategies = useQuantStore((s) => s.strategies)

  return (
    <div className="panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        <Zap className="h-4 w-4 text-amber-400" />
        Strategy monitor
      </h2>
      {strategies.length === 0 ? (
        <p className="text-sm text-zinc-500">No strategy fires yet — watching live trades…</p>
      ) : (
        <ul className="max-h-[220px] space-y-2 overflow-y-auto">
          {strategies.map(({ mint, signal }) => (
            <li
              key={`${mint}-${signal.timestamp}`}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <Link to={`/token/${mint}`} className="truncate text-xs font-semibold text-violet-300">
                  {LABELS[signal.strategyId] ?? signal.strategyId}
                </Link>
                <span className="shrink-0 font-mono text-[11px] text-emerald-400">
                  {Math.round(signal.confidence * 100)}%
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">{mint}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

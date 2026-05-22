import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { useMomentumRankingsState } from '@/hooks/useQuantScanner'
import { RugBadge } from './RugBadge'
import { cn } from '@/lib/utils'

export function MomentumRankings() {
  const { rankings, isLoading } = useMomentumRankingsState()

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          <TrendingUp className="h-4 w-4 text-violet-400" />
          Momentum rankings
        </h2>
        <span className="text-[10px] text-zinc-600">Live quant</span>
      </div>
      {isLoading && rankings.length === 0 ? (
        <p className="text-sm text-zinc-500">Loading rankings…</p>
      ) : rankings.length === 0 ? (
        <p className="text-sm text-zinc-500">Waiting for trade data…</p>
      ) : (
        <ul className="max-h-[280px] space-y-1 overflow-y-auto overscroll-contain">
          {rankings.slice(0, 15).map((r, i) => (
            <li key={r.mint}>
              <Link
                to={`/token/${r.mint}`}
                className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
              >
                <span className="w-5 shrink-0 font-mono text-xs text-zinc-600">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
                  {r.mint.slice(0, 4)}…{r.mint.slice(-4)}
                </span>
                <RugBadge mint={r.mint} compact />
                <span
                  className={cn(
                    'shrink-0 font-mono text-xs font-semibold tabular-nums',
                    r.confidence >= 0.7 ? 'text-emerald-400' : 'text-violet-400',
                  )}
                >
                  {Math.round(r.confidence * 100)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

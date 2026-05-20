import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Radio, Star, TrendingUp, Users } from 'lucide-react'
import {
  formatUsd,
  formatSol,
  formatHolders,
  tokenVolumeSol,
  riskBg,
  riskColor,
  cn,
} from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { useAppStore } from '@/stores/appStore'
import type { PumpToken } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface LiveFeedTableProps {
  tokens: PumpToken[]
}

export function LiveFeedTable({ tokens }: LiveFeedTableProps) {
  const { watchlist, toggleWatchlist } = useAppStore()

  if (tokens.length === 0) {
    return (
      <div className="panel flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
        <Radio className="h-8 w-8 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">No tokens in feed yet</p>
        <p className="max-w-sm text-xs text-zinc-600">
          New Pump.fun launches appear here as the API stream receives them.
        </p>
      </div>
    )
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[#0d0f14]/95 backdrop-blur-md">
            <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3 text-right">Market cap</th>
              <th className="px-4 py-3 text-right">Curve</th>
              <th className="px-4 py-3 text-right">Holders</th>
              <th className="px-4 py-3 text-right">Volume</th>
              <th className="px-4 py-3 text-center">Signal</th>
              <th className="px-4 py-3 text-right">Mom.</th>
              <th className="px-4 py-3 text-center">Flow</th>
              <th className="px-4 py-3 text-right">Age</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {tokens.map((token, i) => {
                const score = token.signalScore ?? token.aiRiskScore ?? 50
                return (
                  <motion.tr
                    key={token.mint}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.3) }}
                    className="group border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggleWatchlist(token.mint)}
                          className={cn(
                            'opacity-60 transition-opacity group-hover:opacity-100',
                            watchlist.includes(token.mint)
                              ? 'text-amber-400'
                              : 'text-zinc-600 hover:text-amber-400',
                          )}
                        >
                          <Star
                            className="h-3.5 w-3.5"
                            fill={watchlist.includes(token.mint) ? 'currentColor' : 'none'}
                          />
                        </button>
                        <TokenImage
                          mint={token.mint}
                          symbol={token.symbol}
                          image={token.image}
                          uri={token.metadataUri}
                          size="sm"
                        />
                        <Link
                          to={`/token/${token.mint}`}
                          className="min-w-0 hover:text-violet-300"
                        >
                          <div className="truncate font-semibold text-white">{token.symbol}</div>
                          <div className="truncate text-[11px] text-zinc-500">{token.name}</div>
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-200">
                      {formatUsd(token.marketCap)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                            style={{ width: `${Math.min(100, token.bondingCurvePercent)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-cyan-400/90">
                          {token.bondingCurvePercent}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center justify-end gap-1 font-mono text-xs text-zinc-300">
                        <Users className="h-3 w-3 text-zinc-600" />
                        {formatHolders(token.holders)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-300">
                      {formatSol(tokenVolumeSol(token))}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          'inline-block min-w-[2rem] rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums',
                          riskBg(score),
                          riskColor(score),
                        )}
                      >
                        {score}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center justify-end gap-0.5 font-mono text-xs text-violet-400">
                        <TrendingUp className="h-3 w-3 opacity-70" />
                        {token.momentumScore}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                          token.whaleActivity === 'high' && 'bg-violet-500/15 text-violet-300',
                          token.whaleActivity === 'medium' && 'bg-blue-500/15 text-blue-300',
                          token.whaleActivity === 'low' && 'bg-zinc-500/10 text-zinc-500',
                        )}
                      >
                        {token.whaleActivity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] tabular-nums text-zinc-500">
                      {formatDistanceToNow(new Date(token.launchedAt), { addSuffix: true })}
                    </td>
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  )
}

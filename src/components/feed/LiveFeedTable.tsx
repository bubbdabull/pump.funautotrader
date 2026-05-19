import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Star, TrendingUp } from 'lucide-react'
import { formatUsd, formatSol, tokenVolumeSol, riskBg, riskColor, cn } from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { useAppStore } from '@/stores/appStore'
import type { PumpToken } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface LiveFeedTableProps {
  tokens: PumpToken[]
}

export function LiveFeedTable({ tokens }: LiveFeedTableProps) {
  const { watchlist, toggleWatchlist } = useAppStore()

  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-zinc-500">
            <th className="p-3">Token</th>
            <th className="p-3">Market Cap</th>
            <th className="p-3">Curve %</th>
            <th className="p-3">Holders</th>
            <th className="p-3">Volume</th>
            <th className="p-3">Signal</th>
            <th className="p-3">Momentum</th>
            <th className="p-3">Whale</th>
            <th className="p-3">Launched</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {tokens.map((token, i) => (
              <motion.tr
                key={token.mint}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.03 }}
                className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
              >
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleWatchlist(token.mint)}
                      className={cn(
                        watchlist.includes(token.mint) ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-400',
                      )}
                    >
                      <Star className="h-4 w-4" fill={watchlist.includes(token.mint) ? 'currentColor' : 'none'} />
                    </button>
                    <TokenImage mint={token.mint} symbol={token.symbol} image={token.image} size="sm" />
                    <Link to={`/token/${token.mint}`} className="hover:text-purple-400">
                      <span className="font-semibold text-white">{token.symbol}</span>
                      <span className="ml-2 text-xs text-zinc-500">{token.name}</span>
                    </Link>
                  </div>
                </td>
                <td className="p-3 font-mono">{formatUsd(token.marketCap)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${token.bondingCurvePercent}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-purple-500"
                      />
                    </div>
                    <span className="font-mono text-teal-400">{token.bondingCurvePercent}%</span>
                  </div>
                </td>
                <td className="p-3 font-mono">{token.holders.toLocaleString()}</td>
                <td className="p-3 font-mono">{formatSol(tokenVolumeSol(token))}</td>
                <td className="p-3">
                  <span className={cn('rounded-lg border px-2 py-0.5 font-mono text-xs font-bold', riskBg(token.signalScore ?? token.aiRiskScore ?? 50), riskColor(token.signalScore ?? token.aiRiskScore ?? 50))}>
                    {token.signalScore ?? token.aiRiskScore}
                  </span>
                </td>
                <td className="p-3">
                  <span className="flex items-center gap-1 font-mono text-purple-400">
                    <TrendingUp className="h-3 w-3" />
                    {token.momentumScore}
                  </span>
                </td>
                <td className="p-3 capitalize">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      token.whaleActivity === 'high' && 'bg-purple-500/20 text-purple-300',
                      token.whaleActivity === 'medium' && 'bg-blue-500/20 text-blue-300',
                      token.whaleActivity === 'low' && 'bg-zinc-500/20 text-zinc-400',
                    )}
                  >
                    {token.whaleActivity}
                  </span>
                </td>
                <td className="p-3 text-xs text-zinc-500">
                  {formatDistanceToNow(new Date(token.launchedAt), { addSuffix: true })}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}

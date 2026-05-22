import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Radio, Star, TrendingUp, Users } from 'lucide-react'
import {
  formatUsd,
  formatSol,
  formatHolders,
  displayHolderCount,
  tokenVolumeSol,
  riskBg,
  riskColor,
  cn,
} from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { ActivityPulse, TokenActivityBadges } from '@/components/shared/TokenActivityBadges'
import { LiveValue } from '@/components/shared/LiveValue'
import { RugBadge } from '@/components/quant/RugBadge'
import { useQuantStore } from '@/stores/quantStore'
import { useAppStore } from '@/stores/appStore'
import { useLiveTick, secondsSince, formatSecondsAgo } from '@/hooks/useLiveTick'
import type { PumpToken } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface LiveFeedTableProps {
  tokens: PumpToken[]
  highlightGraduating?: boolean
}

export function LiveFeedTable({ tokens, highlightGraduating }: LiveFeedTableProps) {
  const { watchlist, toggleWatchlist } = useAppStore()
  const byMint = useQuantStore((s) => s.byMint)
  const tick = useLiveTick()

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
    <div className="panel hidden overflow-hidden md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[#0d0f14]/95 backdrop-blur-md">
            <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3 text-center">Rug</th>
              <th className="px-4 py-3 text-right">Market cap</th>
              <th className="px-4 py-3 text-right">Δ 5m</th>
              <th className="px-4 py-3 text-right">Buy%</th>
              <th className="px-4 py-3 text-right">Last</th>
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
            <AnimatePresence initial={false} mode="popLayout">
              {tokens.map((token, i) => {
                const score = token.signalScore ?? token.aiRiskScore ?? 50
                const lastSec = secondsSince(token.lastTradeAt, tick)
                const vol = tokenVolumeSol(token)
                return (
                  <motion.tr
                    key={token.mint}
                    layout
                    layoutId={token.mint}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      layout: { type: 'spring', stiffness: 400, damping: 35 },
                      opacity: { duration: 0.2 },
                      delay: Math.min(i * 0.015, 0.2),
                    }}
                    className={cn(
                      'group border-b border-white/[0.03] transition-colors hover:bg-white/[0.04]',
                      token.isActive && 'feed-row-live',
                    )}
                  >
                    <td className="max-w-[220px] px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleWatchlist(token.mint)}
                          className={cn(
                            'flex h-9 w-5 shrink-0 items-center justify-center opacity-60 transition-opacity group-hover:opacity-100',
                            watchlist.includes(token.mint)
                              ? 'text-amber-400'
                              : 'text-zinc-600 hover:text-amber-400',
                          )}
                        >
                          <Star
                            className="h-3.5 w-3.5 shrink-0"
                            fill={watchlist.includes(token.mint) ? 'currentColor' : 'none'}
                          />
                        </button>
                        <TokenImage {...tokenMediaProps(token)} size="sm" />
                        <Link
                          to={`/token/${token.mint}`}
                          className="min-w-0 flex-1 overflow-hidden hover:text-violet-300"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <ActivityPulse active={token.isActive} />
                            <span className="truncate font-semibold text-white">
                              {displayTokenSymbol(token)}
                            </span>
                            {(highlightGraduating || token.bondingCurvePercent >= 78) && (
                              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
                                grad
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-zinc-500">
                            {displayTokenName(token)}
                          </div>
                          <TokenActivityBadges token={token} compact />
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <RugBadge mint={token.mint} compact />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-200">
                      <LiveValue value={token.marketCap}>{formatUsd(token.marketCap)}</LiveValue>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      <LiveValue value={token.mcapChange5m ?? 0}>
                        <span
                          className={cn(
                            (token.mcapChange5m ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
                          )}
                        >
                          {(token.mcapChange5m ?? 0) >= 0 ? '+' : ''}
                          {(token.mcapChange5m ?? 0).toFixed(1)}%
                        </span>
                      </LiveValue>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-300">
                      <LiveValue value={token.buyPressure1m ?? 50}>
                        {token.buyPressure1m ?? 50}%
                      </LiveValue>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px]">
                      <span
                        className={cn(
                          'tabular-nums',
                          lastSec != null && lastSec <= 15
                            ? 'font-medium text-emerald-400'
                            : lastSec != null && lastSec <= 60
                              ? 'text-cyan-400/80'
                              : 'text-zinc-500',
                        )}
                      >
                        {formatSecondsAgo(lastSec)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="curve-bar-fill h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                            style={{ width: `${Math.min(100, token.bondingCurvePercent)}%` }}
                          />
                        </div>
                        <LiveValue
                          value={token.bondingCurvePercent}
                          className="font-mono text-xs text-cyan-400/90"
                        >
                          {token.bondingCurvePercent}%
                        </LiveValue>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center justify-end gap-1 font-mono text-xs text-zinc-300">
                        <Users className="h-3 w-3 text-zinc-600" />
                        <LiveValue
                          value={displayHolderCount({
                            ...token,
                            holders: byMint[token.mint]?.holders ?? token.holders,
                            holdersVerified:
                              byMint[token.mint]?.holdersVerified ?? token.holdersVerified,
                          })}
                        >
                          {formatHolders(
                            displayHolderCount({
                              ...token,
                              holders: byMint[token.mint]?.holders ?? token.holders,
                              holdersVerified:
                                byMint[token.mint]?.holdersVerified ?? token.holdersVerified,
                            }),
                            byMint[token.mint]?.holdersVerified ?? token.holdersVerified,
                          )}
                        </LiveValue>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-zinc-300">
                      <LiveValue value={vol}>{formatSol(vol)}</LiveValue>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <LiveValue value={score}>
                        <span
                          className={cn(
                            'inline-block min-w-[2rem] rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums',
                            riskBg(score),
                            riskColor(score),
                          )}
                        >
                          {score}
                        </span>
                      </LiveValue>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center justify-end gap-0.5 font-mono text-xs text-violet-400">
                        <TrendingUp className="h-3 w-3 opacity-70" />
                        <LiveValue value={token.momentumScore}>{token.momentumScore}</LiveValue>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
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

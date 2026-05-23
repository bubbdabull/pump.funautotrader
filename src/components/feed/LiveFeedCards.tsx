import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users } from 'lucide-react'
import { formatUsd, formatSol, formatHolders, tokenVolumeSol, riskBg, riskColor, cn } from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { ActivityPulse, TokenActivityBadges } from '@/components/shared/TokenActivityBadges'
import { LiveValue } from '@/components/shared/LiveValue'
import { RugBadge } from '@/components/quant/RugBadge'
import { useQuantStore } from '@/stores/quantStore'
import type { PumpToken } from '@/types'

interface LiveFeedCardsProps {
  tokens: PumpToken[]
}

export function LiveFeedCards({ tokens }: LiveFeedCardsProps) {
  const byMint = useQuantStore((s) => s.byMint)

  if (tokens.length === 0) {
    return (
      <div className="panel flex min-h-[200px] items-center justify-center p-6 text-sm text-zinc-500">
        Waiting for live stream…
      </div>
    )
  }

  return (
    <div className="space-y-3 md:hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {tokens.map((token, i) => {
          const score = token.signalScore ?? token.aiRiskScore ?? 50
          const holders = byMint[token.mint]?.holders ?? token.holders
          const vol = tokenVolumeSol(token)
          return (
            <motion.div
              key={token.mint}
              layout
              layoutId={`card-${token.mint}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{
                layout: { type: 'spring', stiffness: 380, damping: 32 },
                delay: Math.min(i * 0.03, 0.25),
              }}
            >
              <Link
                to={`/token/${token.mint}`}
                className={cn(
                  'panel flex items-start gap-3 p-3 transition-shadow active:scale-[0.99]',
                  token.isActive && 'border-emerald-500/20 shadow-[0_0_20px_rgba(20,184,166,0.08)]',
                )}
              >
                <div className="relative shrink-0">
                  <TokenImage {...tokenMediaProps(token)} size="md" />
                  {token.isActive && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative h-3 w-3 rounded-full border-2 border-[#0d0f14] bg-emerald-400" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <ActivityPulse active={token.isActive} />
                        <span className="block truncate font-semibold text-white">
                          {displayTokenSymbol(token)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-zinc-500">{displayTokenName(token)}</p>
                    </div>
                    <div className="shrink-0">
                      <RugBadge mint={token.mint} compact />
                    </div>
                  </div>
                  <div className="mt-2">
                    <TokenActivityBadges token={token} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-zinc-500">MCap</span>
                    <span className="text-right font-mono text-zinc-200">
                      <LiveValue value={token.marketCap}>{formatUsd(token.marketCap)}</LiveValue>
                    </span>
                    <span className="text-zinc-500">Curve</span>
                    <span className="text-right font-mono text-cyan-400">
                      <LiveValue value={token.bondingCurvePercent}>
                        {token.bondingCurvePercent}%
                      </LiveValue>
                    </span>
                    <span className="inline-flex items-center gap-1 text-zinc-500">
                      <Users className="h-3 w-3" /> Holders
                    </span>
                    <span className="text-right font-mono text-zinc-200">
                      {formatHolders(holders, token.holdersVerified)}
                    </span>
                    <span className="text-zinc-500">Vol</span>
                    <span className="text-right font-mono text-zinc-200">
                      <LiveValue value={vol}>{formatSol(vol)}</LiveValue>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <LiveValue value={score}>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
                          riskBg(score),
                          riskColor(score),
                        )}
                      >
                        Sig {score}
                      </span>
                    </LiveValue>
                    {token.trades1m != null && token.trades1m > 0 && (
                      <span className="font-mono text-[10px] tabular-nums text-cyan-400">
                        {token.trades1m} tx/m
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

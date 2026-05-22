import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { formatUsd, formatSol, formatHolders, tokenVolumeSol, riskBg, riskColor, cn } from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { RugBadge } from '@/components/quant/RugBadge'
import { useQuantStore } from '@/stores/quantStore'
import type { PumpToken } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface LiveFeedCardsProps {
  tokens: PumpToken[]
}

export function LiveFeedCards({ tokens }: LiveFeedCardsProps) {
  const byMint = useQuantStore((s) => s.byMint)

  if (tokens.length === 0) {
    return (
      <div className="panel flex min-h-[200px] items-center justify-center p-6 text-sm text-zinc-500">
        No tokens in feed
      </div>
    )
  }

  return (
    <div className="space-y-3 md:hidden">
      {tokens.map((token) => {
        const score = token.signalScore ?? token.aiRiskScore ?? 50
        const holders = byMint[token.mint]?.holders ?? token.holders
        return (
          <Link
            key={token.mint}
            to={`/token/${token.mint}`}
            className="panel flex items-start gap-3 p-3 active:scale-[0.99]"
          >
            <div className="shrink-0">
              <TokenImage
                mint={token.mint}
                symbol={token.symbol}
                image={token.image}
                uri={token.metadataUri}
                size="md"
              />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{token.symbol}</span>
                  <p className="truncate text-xs text-zinc-500">{token.name}</p>
                </div>
                <div className="shrink-0">
                  <RugBadge mint={token.mint} compact />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-zinc-500">MCap</span>
                <span className="text-right font-mono text-zinc-200">{formatUsd(token.marketCap)}</span>
                <span className="text-zinc-500">Curve</span>
                <span className="text-right font-mono text-cyan-400">{token.bondingCurvePercent}%</span>
                <span className="inline-flex items-center gap-1 text-zinc-500">
                  <Users className="h-3 w-3" /> Holders
                </span>
                <span className="text-right font-mono text-zinc-200">{formatHolders(holders)}</span>
                <span className="text-zinc-500">Vol</span>
                <span className="text-right font-mono text-zinc-200">{formatSol(tokenVolumeSol(token))}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
                    riskBg(score),
                    riskColor(score),
                  )}
                >
                  Sig {score}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {formatDistanceToNow(new Date(token.launchedAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

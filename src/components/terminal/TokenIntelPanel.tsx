import { memo } from 'react'
import { ExternalLink, Globe } from 'lucide-react'
import { HolderBubbleMap } from '@/components/terminal/HolderBubbleMap'
import { useStreamStore } from '@/core/streamStore'
import { feedConfidenceScore, tradeableRejectionReasons } from '@/lib/feedQuality'
import type { PumpToken } from '@/types'

interface TokenIntelPanelProps {
  token?: PumpToken
  mint: string
}

function TokenIntelPanelInner({ token, mint }: TokenIntelPanelProps) {
  const graph = useStreamStore((s) => (mint ? s.walletGraphs[mint] : undefined))

  if (!token) {
    return (
      <div className="terminal-panel flex h-full flex-col p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Intelligence
        </h3>
        <div className="terminal-warmup mt-4 flex flex-1 flex-col items-center justify-center gap-2">
          <div className="h-20 w-20 animate-pulse rounded-full border border-white/10" />
          <p className="text-xs text-zinc-500">Holder map & metadata</p>
        </div>
      </div>
    )
  }

  const confidence = feedConfidenceScore(token)
  const reasons = tradeableRejectionReasons(token)

  return (
    <div className="terminal-panel flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="border-b border-white/[0.06] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Holder depth
        </h3>
        <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
          Confidence {confidence}/100
          {reasons.length > 0 && reasons[0] !== 'ingest_gate' ? ` · ${reasons.join(', ')}` : ''}
        </p>
      </div>

      <div className="p-3">
        <HolderBubbleMap graph={graph} token={token} />
      </div>

      {(token.twitter || token.telegram || token.website) && (
        <div className="border-t border-white/[0.06] px-3 py-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Socials
          </h4>
          <div className="flex flex-wrap gap-2 text-xs">
            {token.twitter && (
              <a
                href={
                  token.twitter.startsWith('http')
                    ? token.twitter
                    : `https://twitter.com/${token.twitter}`
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-sky-400 hover:bg-white/5"
              >
                <ExternalLink className="h-3 w-3" /> X
              </a>
            )}
            {token.telegram && (
              <a
                href={
                  token.telegram.startsWith('http')
                    ? token.telegram
                    : `https://t.me/${token.telegram}`
                }
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-white/10 px-2 py-1 text-blue-400 hover:bg-white/5"
              >
                Telegram
              </a>
            )}
            {token.website && (
              <a
                href={
                  token.website.startsWith('http') ? token.website : `https://${token.website}`
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-teal-400 hover:bg-white/5"
              >
                <Globe className="h-3 w-3" /> Web
              </a>
            )}
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-white/[0.06] px-3 py-2 text-[10px] text-zinc-600">
        <p>Curve {token.bondingCurvePercent.toFixed(1)}%</p>
        <p>Momentum {token.momentumScore}</p>
        {token.top1Pct != null && <p>Top wallet {(token.top1Pct * 100).toFixed(1)}%</p>}
      </div>
    </div>
  )
}

export const TokenIntelPanel = memo(
  TokenIntelPanelInner,
  (a, b) => a.mint === b.mint && a.token?.updatedAt === b.token?.updatedAt,
)

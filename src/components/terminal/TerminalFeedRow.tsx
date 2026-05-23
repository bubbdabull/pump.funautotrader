import { memo } from 'react'
import { cn, formatUsd, formatHolders } from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenSymbol } from '@/lib/tokenDisplay'
import { LiveValue } from '@/components/shared/LiveValue'
import { MicroSparkline } from '@/components/terminal/MicroSparkline'
import {
  confidenceTier,
  flowVisual,
  feedBadges,
  formatTokenAge,
} from '@/lib/tokenFeedVisuals'
import { feedConfidenceScore } from '@/lib/feedQuality'
import type { PumpToken } from '@/types'

interface TerminalFeedRowProps {
  token: PumpToken
  selected: boolean
  onSelect: (mint: string) => void
}

function TerminalFeedRowInner({ token, selected, onSelect }: TerminalFeedRowProps) {
  const flow = flowVisual(token)
  const tier = confidenceTier(token)
  const badges = feedBadges(token)
  const change = token.mcapChange5m ?? token.priceChange24h
  const vol5 = token.volume5mSol ?? 0
  const vol1m = token.trades1m != null ? token.trades1m * 0.08 : 0

  return (
    <button
      type="button"
      onClick={() => onSelect(token.mint)}
      className={cn(
        'terminal-feed-row group flex w-full items-center gap-2 border-b border-white/[0.04] px-2 py-1.5 text-left transition-colors',
        selected && 'terminal-feed-row-selected',
        flow === 'inflow' && 'terminal-flow-inflow',
        flow === 'sell' && 'terminal-flow-sell',
        flow === 'active' && 'terminal-flow-active',
      )}
    >
      <TokenImage {...tokenMediaProps(token)} size="xs" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-semibold text-white">
            {displayTokenSymbol(token)}
          </span>
          {badges.map((b) => (
            <span
              key={b}
              className={cn(
                'rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide',
                b === 'NEW' && 'bg-sky-500/20 text-sky-300',
                b === 'HOT' && 'bg-orange-500/25 text-orange-300',
                b === 'MIGRATING' && 'bg-violet-500/25 text-violet-300',
              )}
            >
              {b}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span className="font-mono">{formatTokenAge(token)}</span>
          <span>{formatHolders(token.holders, token.holdersVerified)}</span>
        </div>
      </div>

      <MicroSparkline mint={token.mint} className="shrink-0 opacity-90" />

      <div className="shrink-0 text-right">
        <LiveValue
          value={token.marketCap}
          className="block font-mono text-[11px] font-medium text-zinc-200"
        >
          {formatUsd(token.marketCap)}
        </LiveValue>
        <span
          className={cn(
            'font-mono text-[10px]',
            change >= 0 ? 'text-emerald-400' : 'text-red-400',
          )}
        >
          {change >= 0 ? '+' : ''}
          {change.toFixed(1)}%
        </span>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="font-mono text-[10px] text-zinc-400">{vol5.toFixed(2)} 5m</p>
        <p className="font-mono text-[10px] text-zinc-600">{vol1m > 0 ? `${vol1m.toFixed(2)} 1m` : '—'}</p>
      </div>

      <span
        className={cn(
          'shrink-0 rounded border px-1 py-0.5 text-[9px] font-bold uppercase',
          tier === 'high' && 'border-emerald-500/40 text-emerald-400',
          tier === 'medium' && 'border-amber-500/40 text-amber-300',
          tier === 'low' && 'border-zinc-600 text-zinc-500',
        )}
        title={`Confidence ${feedConfidenceScore(token)}`}
      >
        {tier === 'high' ? 'HI' : tier === 'medium' ? 'MD' : 'LO'}
      </span>
    </button>
  )
}

function rowEqual(a: TerminalFeedRowProps, b: TerminalFeedRowProps) {
  const t = a.token
  const u = b.token
  return (
    a.selected === b.selected &&
    t.mint === u.mint &&
    t.updatedAt === u.updatedAt &&
    t.lastTradeAt === u.lastTradeAt &&
    t.marketCap === u.marketCap &&
    t.buyPressure1m === u.buyPressure1m &&
    t.isActive === u.isActive
  )
}

export const TerminalFeedRow = memo(TerminalFeedRowInner, rowEqual)

import { memo } from 'react'
import { TradingChart } from '@/components/charts/TradingChart'
import { TradeTape } from '@/components/terminal/TradeTape'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { formatUsd } from '@/lib/utils'
import { LifecycleBadge } from '@/components/terminal/LifecycleBadge'
import { MetricBar } from '@/components/terminal/MetricBar'
import type { PumpToken } from '@/types'

interface TerminalChartPanelProps {
  token: PumpToken | undefined
  mint: string
}

function TerminalChartPanelInner({ token, mint }: TerminalChartPanelProps) {
  if (!token || !mint) {
    return (
      <div className="terminal-panel flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-6">
        <div className="h-16 w-16 rounded-full border border-dashed border-violet-500/30 bg-violet-500/5" />
        <p className="text-sm text-zinc-500">Select a token from the live feed</p>
        <p className="text-[11px] text-zinc-600">Charts stream from trade:tick events</p>
      </div>
    )
  }

  return (
    <div className="terminal-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <TokenImage {...tokenMediaProps(token)} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-white">
              {displayTokenSymbol(token)}
            </h2>
            <LifecycleBadge state={token.lifecycle} compact />
          </div>
          <p className="truncate text-xs text-zinc-500">{displayTokenName(token)}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-violet-200">
            {formatUsd(token.marketCap)}
          </p>
          <p className="text-[10px] text-zinc-500">market cap</p>
        </div>
      </div>

      <div className="terminal-chart-pulse-wrap flex min-h-0 flex-1 flex-col overflow-hidden">
        <TradingChart mint={mint} variant="embed" />
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-white/[0.06] p-2">
        {token.migrationProbability != null && (
          <MetricBar label="Migr" value={token.migrationProbability} tone="purple" />
        )}
        {token.buyPressure1m != null && (
          <MetricBar label="Buy" value={token.buyPressure1m} tone="emerald" />
        )}
        {token.burstIgnition != null && (
          <MetricBar label="Burst" value={token.burstIgnition} tone="amber" />
        )}
      </div>

      <TradeTape mint={mint} />
    </div>
  )
}

export const TerminalChartPanel = memo(
  TerminalChartPanelInner,
  (a, b) => a.mint === b.mint && a.token?.updatedAt === b.token?.updatedAt,
)

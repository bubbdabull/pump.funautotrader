import { Bot, Radio, Shield } from 'lucide-react'
import { PageTransition } from '@/components/shared/PageTransition'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { useAutoTraderStore } from '@/stores/autoTraderStore'
import { useAutoTrader } from '@/hooks/useAutoTrader'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { useTokenFeed } from '@/hooks/useTokens'
import { cn } from '@/lib/utils'

export function AutoTraderPage() {
  const { rules, toggleEnabled, signals, executions } = useAutoTraderStore()
  const { data: tokens = [] } = useTokenFeed()
  useAutoTrader()

  const confirmed = executions.filter((e) => e.status === 'confirmed').length
  const failed = executions.filter((e) => e.status === 'failed').length

  return (
    <PageTransition>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Auto Trader</h1>
          <p className="text-sm text-zinc-500">
            Rule-based sniping via{' '}
            <a
              href="https://pumpportal.fun/local-trading-api/trading-api"
              target="_blank"
              rel="noreferrer"
              className="text-teal-400 hover:underline"
            >
              PumpPortal
            </a>{' '}
            — no AI, pure execution
          </p>
        </div>
        <Button
          variant={rules.enabled ? 'danger' : 'success'}
          onClick={toggleEnabled}
          className="gap-2"
        >
          <Bot className="h-4 w-4" />
          {rules.enabled ? 'Stop Auto-Trade' : 'Start Auto-Trade'}
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <GlassCard glow={rules.enabled ? 'teal' : 'none'}>
          <Radio className="mb-2 h-5 w-5 text-teal-400" />
          <p className="text-xs text-zinc-500">Status</p>
          <p className={cn('text-lg font-bold', rules.enabled ? 'text-emerald-400' : 'text-zinc-400')}>
            {rules.enabled ? 'LIVE' : 'PAUSED'}
          </p>
        </GlassCard>
        <GlassCard>
          <Shield className="mb-2 h-5 w-5 text-purple-400" />
          <p className="text-xs text-zinc-500">Confirmed trades</p>
          <p className="font-mono text-lg font-bold text-white">{confirmed}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-zinc-500">Failed / Signals</p>
          <p className="font-mono text-lg font-bold text-red-400">{failed}</p>
          <p className="text-xs text-zinc-600">{signals.length} signals total</p>
        </GlassCard>
      </div>

      <GlassCard className="mb-6">
        <h3 className="mb-3 font-semibold text-white">Active rules</h3>
        <ul className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
          <li>Buy {rules.buyAmountSol} SOL per snipe</li>
          <li>Curve {rules.minBondingCurve}% – {rules.maxBondingCurve}%</li>
          <li>Max mcap ${rules.maxMarketCapUsd.toLocaleString()}</li>
          <li>Max signal score {rules.maxSignalScore} (lower = better)</li>
          <li>Slippage {rules.slippage}% · Pool {rules.pool}</li>
          <li>Take profit +{rules.autoSellTakeProfitPct}% · Stop -{rules.autoSellStopLossPct}%</li>
        </ul>
        <p className="mt-3 text-xs text-zinc-600">
          Configure in the right panel. Trades execute through your connected wallet.
        </p>
      </GlassCard>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">Live PumpPortal feed</h2>
      <LiveFeedTable tokens={tokens} />
    </PageTransition>
  )
}

import { motion } from 'framer-motion'
import { Activity, AlertTriangle, DollarSign, TrendingUp, Zap } from 'lucide-react'
import { PageTransition } from '@/components/shared/PageTransition'
import { MetricWidget } from '@/components/shared/MetricWidget'
import { TokenCard } from '@/components/shared/TokenCard'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { LiveFeedCards } from '@/components/feed/LiveFeedCards'
import { TradingPanel } from '@/components/trading/TradingPanel'
import { MomentumRankings } from '@/components/quant/MomentumRankings'
import { StrategyMonitor } from '@/components/quant/StrategyMonitor'
import { useScannerFeed } from '@/hooks/useTokens'
import { useMomentumRankingsState } from '@/hooks/useQuantScanner'
import { MarketOverviewChart } from '@/components/charts/MarketOverviewChart'
import { DataHealthBanner } from '@/components/shared/DataHealthBanner'
import { Link } from 'react-router-dom'
import type { PumpToken } from '@/types'
import { tokenVolumeSol } from '@/lib/utils'
import { ensureArray } from '@/lib/ensureArray'

function formatVolumeDisplay(sol: number): { value: number; suffix: string } {
  if (sol >= 1000) return { value: Number((sol / 1000).toFixed(1)), suffix: 'K SOL' }
  return { value: Number(sol.toFixed(1)), suffix: ' SOL' }
}

export function DashboardPage() {
  const {
    data: feedData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    displayMode,
    tradeableCount,
  } = useScannerFeed('tradeable')
  const { data: graduatingData } = useScannerFeed('graduating')
  const tokens = ensureArray<PumpToken>(feedData)
  const graduating = ensureArray<PumpToken>(graduatingData)
  useMomentumRankingsState()

  const usingFallback = displayMode === 'watchlist_fallback'
  const top = [...tokens].sort((a, b) => b.momentumScore - a.momentumScore).slice(0, 3)
  const feedByMint = Object.fromEntries(tokens.map((t) => [t.mint, t]))

  const hourAgo = Date.now() - 60 * 60 * 1000
  const volumeSol = tokens.reduce((s, t) => s + tokenVolumeSol(t), 0)
  const volumeDisplay = formatVolumeDisplay(volumeSol)
  const active = tokens.length
  const signals = tokens.filter(
    (t) => (t.signalScore ?? t.aiRiskScore ?? 50) <= 55 || t.momentumScore >= 55,
  ).length
  const newHour = tokens.filter((t) => new Date(t.launchedAt).getTime() > hourAgo).length

  return (
    <PageTransition>
      <div className="mb-4 lg:mb-6">
        <h1 className="text-xl font-bold tracking-tight text-white lg:text-2xl">Dashboard</h1>
        <p className="text-xs text-zinc-500 lg:text-sm">
          Live Pump.fun ·{' '}
          {isLoading
            ? 'loading…'
            : `${tradeableCount} tradeable · ${tokens.length} shown${usingFallback ? ' (watchlist)' : ''}`}
          {dataUpdatedAt > 0 && (
            <span className="text-zinc-600">
              {' '}
              · updated {Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000))}s ago
              {isFetching ? ' · syncing…' : ''}
            </span>
          )}
        </p>
      </div>

      <DataHealthBanner />

      {usingFallback && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            No tokens pass the full tradeable bar yet (holders need on-chain verification via{' '}
            <strong>HELIUS_API_KEY</strong> on the server). Showing top watchlist by quality until
            holder enrichment catches up.
          </p>
        </div>
      )}

      <motion.div
        className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mb-6 lg:gap-4 xl:grid-cols-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <MetricWidget
          label="Feed Volume"
          value={volumeDisplay.value}
          suffix={volumeDisplay.suffix}
          icon={DollarSign}
          accent="purple"
        />
        <MetricWidget label="Active" value={active} decimals={0} icon={Activity} accent="blue" />
        <MetricWidget label="Signals" value={signals} decimals={0} icon={Zap} accent="teal" />
        <MetricWidget label="New (1h)" value={newHour} decimals={0} icon={TrendingUp} accent="purple" />
        <MetricWidget
          label="Graduating"
          value={graduating.length}
          decimals={0}
          icon={TrendingUp}
          accent="teal"
        />
      </motion.div>

      <div className="mb-4 lg:mb-6">
        <MarketOverviewChart tokens={tokens} />
      </div>

      <div className="mb-4 grid gap-4 lg:mb-6 lg:grid-cols-2">
        <MomentumRankings feedByMint={feedByMint} />
        <StrategyMonitor />
      </div>

      <motion.div
        className="grid gap-4 lg:gap-6 xl:grid-cols-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="space-y-4 lg:space-y-6 xl:col-span-2">
          <motion.div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Top Momentum
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {top.length > 0 ? (
                top.map((t, i) => <TokenCard key={t.mint} token={t} index={i} />)
              ) : (
                <p className="col-span-full text-sm text-zinc-500">
                  Waiting for live tokens… check server is running and PumpPortal key is set.
                </p>
              )}
            </div>
          </motion.div>
          <motion.div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                {usingFallback ? 'Watchlist feed' : 'Tradeable feed'}
              </h2>
              <Link to="/feed" className="text-xs text-violet-400 hover:text-violet-300">
                Scanner →
              </Link>
            </div>
            <LiveFeedCards tokens={tokens.slice(0, 20)} />
            <div className="mt-3 hidden md:block">
              <LiveFeedTable tokens={tokens.slice(0, 12)} />
            </div>
          </motion.div>
        </div>
        <div className="hidden lg:block">
          <TradingPanel token={tokens[0]} />
        </div>
      </motion.div>
    </PageTransition>
  )
}

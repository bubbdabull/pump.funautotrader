import { motion } from 'framer-motion'
import { Activity, DollarSign, TrendingUp, Zap } from 'lucide-react'
import { PageTransition } from '@/components/shared/PageTransition'
import { MetricWidget } from '@/components/shared/MetricWidget'
import { TokenCard } from '@/components/shared/TokenCard'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { LiveFeedCards } from '@/components/feed/LiveFeedCards'
import { TradingPanel } from '@/components/trading/TradingPanel'
import { MomentumRankings } from '@/components/quant/MomentumRankings'
import { StrategyMonitor } from '@/components/quant/StrategyMonitor'
import { useScannerFeed, useFeedStats } from '@/hooks/useTokens'
import { useMomentumRankingsState } from '@/hooks/useQuantScanner'
import { MarketOverviewChart } from '@/components/charts/MarketOverviewChart'
import { Link } from 'react-router-dom'
import type { PumpToken } from '@/types'
import { tokenVolumeSol } from '@/lib/utils'
import { ensureArray } from '@/lib/ensureArray'

function formatVolumeDisplay(sol: number): { value: number; suffix: string } {
  if (sol >= 1000) return { value: Number((sol / 1000).toFixed(1)), suffix: 'K SOL' }
  return { value: Number(sol.toFixed(1)), suffix: ' SOL' }
}

export function DashboardPage() {
  const { data: feedData, isLoading } = useScannerFeed('all')
  const { data: alphaData } = useScannerFeed('alpha')
  const { data: graduatingData } = useScannerFeed('graduating')
  const tokens = ensureArray<PumpToken>(feedData)
  const alphaTokens = ensureArray<PumpToken>(alphaData)
  const graduating = ensureArray<PumpToken>(graduatingData)
  const { data: stats } = useFeedStats()
  useMomentumRankingsState()

  const top = [...tokens].sort((a, b) => b.momentumScore - a.momentumScore).slice(0, 3)

  const hourAgo = Date.now() - 60 * 60 * 1000
  const volumeSol =
    stats?.totalVolume24h ?? tokens.reduce((s, t) => s + tokenVolumeSol(t), 0)
  const volumeDisplay = formatVolumeDisplay(volumeSol)
  const active = stats?.activeTokens ?? tokens.length
  const signals = tokens.filter(
    (t) => (t.signalScore ?? t.aiRiskScore ?? 50) <= 40 || t.momentumScore >= 65,
  ).length
  const newHour =
    stats?.newTokensLastHour ??
    tokens.filter((t) => new Date(t.launchedAt).getTime() > hourAgo).length

  return (
    <PageTransition>
      <div className="mb-4 lg:mb-6">
        <h1 className="text-xl font-bold tracking-tight text-white lg:text-2xl">Dashboard</h1>
        <p className="text-xs text-zinc-500 lg:text-sm">
          Live Pump.fun · {isLoading ? 'loading…' : `${tokens.length} live · ${alphaTokens.length} alpha`}
        </p>
      </div>

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
        <MomentumRankings />
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
                  Waiting for live tokens… ensure API is running on Fly.
                </p>
              )}
            </div>
          </motion.div>
          <motion.div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Alpha feed
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

import { motion } from 'framer-motion'
import { Activity, DollarSign, TrendingUp, Zap } from 'lucide-react'
import { PageTransition } from '@/components/shared/PageTransition'
import { MetricWidget } from '@/components/shared/MetricWidget'
import { TokenCard } from '@/components/shared/TokenCard'
import { LiveFeedTable } from '@/components/feed/LiveFeedTable'
import { TradingPanel } from '@/components/trading/TradingPanel'
import { useTokenFeed, useFeedStats } from '@/hooks/useTokens'
import type { PumpToken } from '@/types'
import { tokenVolumeSol } from '@/lib/utils'
import { ensureArray } from '@/lib/ensureArray'

function formatVolumeDisplay(sol: number): { value: number; suffix: string } {
  if (sol >= 1000) return { value: Number((sol / 1000).toFixed(1)), suffix: 'K SOL' }
  return { value: Number(sol.toFixed(1)), suffix: ' SOL' }
}

export function DashboardPage() {
  const { data: feedData, isLoading } = useTokenFeed()
  const tokens = ensureArray<PumpToken>(feedData)
  const { data: stats } = useFeedStats()
  const top = [...tokens].sort((a, b) => b.momentumScore - a.momentumScore).slice(0, 3)

  const hourAgo = Date.now() - 60 * 60 * 1000
  const volumeSol =
    stats?.totalVolume24h ??
    tokens.reduce((s, t) => s + tokenVolumeSol(t), 0)
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          Live Pump.fun data · {isLoading ? 'loading…' : `${tokens.length} tokens tracked`}
        </p>
      </div>

      <motion.div
        className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
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
        <MetricWidget label="Active Tokens" value={active} decimals={0} icon={Activity} accent="blue" />
        <MetricWidget label="Strong Signals" value={signals} decimals={0} icon={Zap} accent="teal" />
        <MetricWidget label="New (1h)" value={newHour} decimals={0} icon={TrendingUp} accent="purple" />
      </motion.div>

      <motion.div
        className="grid gap-6 xl:grid-cols-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="space-y-6 xl:col-span-2">
          <motion.div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Top Momentum
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {top.length > 0 ? (
                top.map((t, i) => <TokenCard key={t.mint} token={t} index={i} />)
              ) : (
                <p className="col-span-3 text-sm text-zinc-500">
                  Waiting for live tokens… ensure the API server is running.
                </p>
              )}
            </div>
          </motion.div>
          <motion.div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Live Feed
            </h2>
            <LiveFeedTable tokens={tokens} />
          </motion.div>
        </div>
        <TradingPanel token={tokens[0]} />
      </motion.div>
    </PageTransition>
  )
}

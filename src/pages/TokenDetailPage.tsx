import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Users, MessageCircle, AlertTriangle, Globe, ExternalLink } from 'lucide-react'
import { PageTransition } from '@/components/shared/PageTransition'
import { GlassCard } from '@/components/shared/GlassCard'
import { TradingChart } from '@/components/charts/TradingChart'
import { TradingPanel } from '@/components/trading/TradingPanel'
import { Badge } from '@/components/ui/badge'
import { useToken, useTokenTrades } from '@/hooks/useTokens'
import { formatUsd, formatHolders, riskBg, riskColor, shortenAddress } from '@/lib/utils'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { TokenImage } from '@/components/shared/TokenImage'
import { TokenActivityBadges } from '@/components/shared/TokenActivityBadges'
import { LifecycleBadge } from '@/components/terminal/LifecycleBadge'
import { MetricBar } from '@/components/terminal/MetricBar'
import { BubbleMapViz } from '@/components/terminal/BubbleMapViz'
import { ProgressionChart } from '@/components/terminal/ProgressionChart'
import { useStreamStore } from '@/core/streamStore'
import { useTokenChart } from '@/hooks/useRegistry'
import { useQuantStore } from '@/stores/quantStore'

export function TokenDetailPage() {
  const { mint = '' } = useParams()
  const { data: token, isLoading } = useToken(mint)
  const { data: trades = [] } = useTokenTrades(mint)
  const { data: chart } = useTokenChart(mint)
  const walletGraph = useStreamStore((s) => s.getGraph(mint))
  const quant = useQuantStore((s) => s.byMint[mint])

  if (isLoading || !token) {
    return (
      <PageTransition>
        <div className="h-96 animate-pulse rounded-xl bg-white/5" />
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <motion.div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0">
          <TokenImage
            mint={token.mint}
            symbol={token.symbol}
            image={token.image}
            uri={token.metadataUri}
            size="xl"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-white sm:text-2xl">
              {displayTokenSymbol(token)}
            </h1>
            <Badge variant={token.priceChange24h >= 0 ? 'success' : 'danger'} className="shrink-0">
              {token.priceChange24h >= 0 ? '+' : ''}
              {token.priceChange24h.toFixed(1)}%
            </Badge>
            <LifecycleBadge state={token.lifecycle} />
            <span
              className={`shrink-0 rounded-lg border px-2 py-0.5 font-mono text-sm font-bold ${riskBg(token.signalScore ?? token.aiRiskScore ?? 50)} ${riskColor(token.signalScore ?? token.aiRiskScore ?? 50)}`}
            >
              Signal {token.signalScore ?? token.aiRiskScore}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-zinc-500">
            {displayTokenName(token)} · {formatUsd(token.marketCap)} MCap
          </p>
          <div className="mt-2">
            <TokenActivityBadges token={token} />
          </div>
        </div>
      </motion.div>

      <motion.div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <TradingChart mint={mint} />
          <GlassCard>
            <h3 className="mb-2 text-sm font-semibold text-white">Score progression</h3>
            <ProgressionChart points={chart?.progression} metric="score" />
          </GlassCard>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {token.migrationProbability != null && (
              <MetricBar label="Migration prob." value={token.migrationProbability} tone="purple" />
            )}
            {token.burstIgnition != null && (
              <MetricBar label="Burst" value={token.burstIgnition} tone="amber" />
            )}
            {token.buyPressure1m != null && (
              <MetricBar label="Buy pressure" value={token.buyPressure1m} tone="emerald" />
            )}
            {(quant?.rug?.rugScore != null || token.aiRiskScore != null) && (
              <MetricBar
                label="Rug risk"
                value={quant?.rug?.rugScore ?? token.aiRiskScore ?? 0}
                tone="red"
              />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <GlassCard>
              <Users className="mb-2 h-5 w-5 text-purple-400" />
              <p className="text-xs text-zinc-500">Holders</p>
              <p className="font-mono text-xl font-bold">
                {formatHolders(token.holders, token.holdersVerified)}
              </p>
              {(token.trades1m ?? 0) > 0 && !token.holdersVerified && (
                <p className="mt-1 text-[10px] text-zinc-500">
                  {token.trades1m} trades/min · on-chain count enriching
                </p>
              )}
            </GlassCard>
            <GlassCard>
              <Shield className="mb-2 h-5 w-5 text-teal-400" />
              <p className="text-xs text-zinc-500">Bonding Curve</p>
              <p className="font-mono text-xl font-bold text-teal-400">
                {token.bondingCurvePercent}%
              </p>
            </GlassCard>
            <GlassCard>
              <AlertTriangle className="mb-2 h-5 w-5 text-amber-400" />
              <p className="text-xs text-zinc-500">Momentum</p>
              <p className="font-mono text-xl font-bold text-purple-400">{token.momentumScore}</p>
            </GlassCard>
          </div>
          <GlassCard>
            <h3 className="mb-3 font-semibold text-white">Summary</h3>
            <p className="text-sm leading-relaxed text-zinc-400">
              {(token.signalScore ?? token.aiRiskScore ?? 50) < 40
                ? `${displayTokenSymbol(token)} shows live buy pressure. Curve at ${token.bondingCurvePercent}%. Volume ${token.volume24h.toFixed(2)} SOL.`
                : `${displayTokenSymbol(token)} elevated risk. Whale activity: ${token.whaleActivity}.`}
            </p>
          </GlassCard>
          <GlassCard>
            <h3 className="mb-3 font-semibold text-white">Wallet bubble map</h3>
            <BubbleMapViz graph={walletGraph} />
          </GlassCard>
          {(token.twitter || token.telegram || token.website) && (
            <GlassCard>
              <h3 className="mb-2 text-sm font-semibold text-white">Socials</h3>
              <div className="flex flex-wrap gap-3 text-sm">
                {token.twitter && (
                  <a
                    href={token.twitter.startsWith('http') ? token.twitter : `https://twitter.com/${token.twitter}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" /> X
                  </a>
                )}
                {token.telegram && (
                  <a
                    href={token.telegram.startsWith('http') ? token.telegram : `https://t.me/${token.telegram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Telegram
                  </a>
                )}
                {token.website && (
                  <a
                    href={token.website.startsWith('http') ? token.website : `https://${token.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-teal-400 hover:underline"
                  >
                    <Globe className="h-4 w-4" /> Web
                  </a>
                )}
              </div>
            </GlassCard>
          )}
          <GlassCard>
            <h3 className="mb-3 font-semibold text-white">Live Trades</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {trades.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No trades yet — connect the API server or wait for PumpPortal stream.
                </p>
              ) : (
                <AnimatePresence initial={false}>
                {trades.map((tx) => (
                  <motion.div
                    key={tx.signature}
                    layout
                    initial={{ opacity: 0, x: -12, backgroundColor: 'rgba(20,184,166,0.12)' }}
                    animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(255,255,255,0.02)' }}
                    transition={{ duration: 0.35 }}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                  >
                    <span className={tx.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                      {tx.side.toUpperCase()} {tx.solAmount.toFixed(3)} SOL
                    </span>
                    <span className="font-mono text-zinc-500">
                      {shortenAddress(tx.wallet, 4)}
                    </span>
                    {tx.solAmount >= 5 && <Badge>Whale</Badge>}
                  </motion.div>
                ))}
                </AnimatePresence>
              )}
            </div>
          </GlassCard>
        </div>
        <motion.div className="space-y-4">
          <TradingPanel token={token} />
          <GlassCard>
            <MessageCircle className="mb-2 h-5 w-5 text-zinc-400" />
            <p className="text-xs text-zinc-500">Mint</p>
            <p className="break-all font-mono text-xs text-zinc-300">{mint}</p>
          </GlassCard>
        </motion.div>
      </motion.div>
    </PageTransition>
  )
}

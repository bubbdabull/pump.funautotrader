import { memo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, Activity, Zap } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Badge } from '@/components/ui/badge'
import { formatUsd, formatSol, formatHolders, tokenVolumeSol, riskBg, riskColor } from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { ActivityPulse } from '@/components/shared/TokenActivityBadges'
import { LifecycleBadge } from '@/components/terminal/LifecycleBadge'
import { MetricBar } from '@/components/terminal/MetricBar'
import type { PumpToken } from '@/types'

interface TokenCardProps {
  token: PumpToken
  index?: number
}

function TokenCardInner({ token, index = 0 }: TokenCardProps) {
  const score = token.signalScore ?? token.aiRiskScore ?? 50
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link to={`/token/${token.mint}`}>
        <GlassCard hover className="group">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <TokenImage {...tokenMediaProps(token)} size="md" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <ActivityPulse active={token.isActive} />
                <span className="truncate font-semibold text-white">
                  {displayTokenSymbol(token)}
                </span>
                <LifecycleBadge state={token.lifecycle} compact />
                <Badge
                  variant={(token.mcapChange5m ?? token.priceChange24h) >= 0 ? 'success' : 'danger'}
                  className="shrink-0"
                >
                  {(token.mcapChange5m ?? token.priceChange24h) >= 0 ? '+' : ''}
                  {(token.mcapChange5m ?? token.priceChange24h).toFixed(1)}%
                </Badge>
              </div>
              <p className="truncate text-xs text-zinc-500">{displayTokenName(token)}</p>
            </div>
            <div
              className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-mono font-bold ${riskBg(score)}`}
            >
              <span className={riskColor(score)}>{score}</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-zinc-500">MCap</p>
              <p className="font-mono text-zinc-200">{formatUsd(token.marketCap)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Curve</p>
              <p className="font-mono text-teal-400">{token.bondingCurvePercent.toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-zinc-500">Buy%</p>
              <p className="font-mono text-emerald-400/90">{token.buyPressure1m ?? 50}%</p>
            </div>
          </div>
          {(token.migrationProbability != null || token.burstIgnition != null) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {token.migrationProbability != null && (
                <MetricBar label="Migration" value={token.migrationProbability} tone="purple" />
              )}
              {token.burstIgnition != null && (
                <MetricBar label="Burst" value={token.burstIgnition} tone="amber" />
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {formatHolders(token.holders)}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" /> {formatSol(tokenVolumeSol(token))}
            </span>
            {token.burstIgnition != null && token.burstIgnition > 55 && (
              <span className="flex items-center gap-1 text-amber-400/90">
                <Zap className="h-3 w-3" /> burst
              </span>
            )}
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> {token.whaleActivity}
            </span>
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  )
}

function tokenCardPropsEqual(a: TokenCardProps, b: TokenCardProps) {
  return (
    a.token.mint === b.token.mint &&
    a.token.updatedAt === b.token.updatedAt &&
    a.token.lastTradeAt === b.token.lastTradeAt &&
    a.token.signalScore === b.token.signalScore &&
    a.index === b.index
  )
}

export const TokenCard = memo(TokenCardInner, tokenCardPropsEqual)

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, Activity, Zap } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Badge } from '@/components/ui/badge'
import {
  formatUsd,
  formatSol,
  formatHolders,
  riskBg,
  riskColor,
  tokenVolumeSol,
} from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { ActivityPulse } from '@/components/shared/TokenActivityBadges'
import { LifecycleBadge } from '@/components/terminal/LifecycleBadge'
import { MetricBar } from '@/components/terminal/MetricBar'
import { holderDepthScore } from '@/lib/holderDepth'
import type { PumpToken } from '@/types'

interface TokenCardProps {
  token: PumpToken
  index?: number
}

function formatBuyPressure(pct?: number): string {
  if (pct == null) return '—'
  return `${Math.round(pct)}%`
}

function TokenCardInner({ token, index = 0 }: TokenCardProps) {
  const score = token.signalScore ?? token.aiRiskScore
  const depth = holderDepthScore(token)
  const change = token.mcapChange5m ?? token.priceChange24h

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
                {change != null && (
                  <Badge variant={change >= 0 ? 'success' : 'danger'} className="shrink-0">
                    {change >= 0 ? '+' : ''}
                    {change.toFixed(1)}%
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-zinc-500">{displayTokenName(token)}</p>
            </div>
            {score != null && (
              <div
                className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-mono font-bold ${riskBg(score)}`}
              >
                <span className={riskColor(score)}>{Math.round(score)}</span>
              </div>
            )}
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
              <p className="font-mono text-emerald-400/90">{formatBuyPressure(token.buyPressure1m)}</p>
            </div>
          </div>
          {(token.migrationProbability != null || token.burstIgnition != null || depth != null) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {token.migrationProbability != null && (
                <MetricBar label="Migration" value={token.migrationProbability} tone="purple" />
              )}
              {token.burstIgnition != null && (
                <MetricBar label="Burst" value={token.burstIgnition} tone="amber" />
              )}
              {depth != null && (
                <MetricBar label="Holder depth" value={depth} tone="emerald" />
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {formatHolders(token.holders, token.holdersVerified)}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" /> {formatSol(tokenVolumeSol(token))}
            </span>
            {token.momentumScore != null && token.momentumScore > 0 && (
              <span className="font-mono text-purple-400/90">
                mom {Math.round(token.momentumScore)}
              </span>
            )}
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
  const t = a.token
  const u = b.token
  return (
    a.index === b.index &&
    t.mint === u.mint &&
    t.updatedAt === u.updatedAt &&
    t.lastTradeAt === u.lastTradeAt &&
    t.marketCap === u.marketCap &&
    t.bondingCurvePercent === u.bondingCurvePercent &&
    t.buyPressure1m === u.buyPressure1m &&
    t.momentumScore === u.momentumScore &&
    t.migrationProbability === u.migrationProbability &&
    t.burstIgnition === u.burstIgnition &&
    t.signalScore === u.signalScore &&
    t.holders === u.holders &&
    t.isActive === u.isActive &&
    t.top1Pct === u.top1Pct
  )
}

export const TokenCard = memo(TokenCardInner, tokenCardPropsEqual)

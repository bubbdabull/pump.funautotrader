import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, Activity } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Badge } from '@/components/ui/badge'
import { formatUsd, formatSol, tokenVolumeSol, riskBg, riskColor } from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import type { PumpToken } from '@/types'

interface TokenCardProps {
  token: PumpToken
  index?: number
}

export function TokenCard({ token, index = 0 }: TokenCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link to={`/token/${token.mint}`}>
        <GlassCard hover className="group">
          <div className="flex items-center gap-3">
            <TokenImage mint={token.mint} symbol={token.symbol} image={token.image} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{token.symbol}</span>
                <Badge variant={token.priceChange24h >= 0 ? 'success' : 'danger'}>
                  {token.priceChange24h >= 0 ? '+' : ''}
                  {token.priceChange24h.toFixed(1)}%
                </Badge>
              </div>
              <p className="truncate text-xs text-zinc-500">{token.name}</p>
            </div>
            <div className={`rounded-lg border px-2 py-1 text-xs font-mono font-bold ${riskBg(token.signalScore ?? token.aiRiskScore ?? 50)}`}>
              <span className={riskColor(token.signalScore ?? token.aiRiskScore ?? 50)}>{token.signalScore ?? token.aiRiskScore}</span>
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
              <p className="text-zinc-500">Mom.</p>
              <p className="font-mono text-purple-400">{token.momentumScore}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {token.holders}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" /> {formatSol(tokenVolumeSol(token))}
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> {token.whaleActivity}
            </span>
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  )
}

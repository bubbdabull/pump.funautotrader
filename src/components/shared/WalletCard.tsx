import { motion } from 'framer-motion'
import { Copy, TrendingUp } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatUsd, shortenAddress } from '@/lib/utils'
import type { SmartWallet } from '@/types'

interface WalletCardProps {
  wallet: SmartWallet
  index?: number
}

const tierVariant = { elite: 'default' as const, pro: 'blue' as const, rising: 'teal' as const }

export function WalletCard({ wallet, index = 0 }: WalletCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <GlassCard hover glow={wallet.tier === 'elite' ? 'purple' : 'none'}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{wallet.label}</h3>
              <Badge variant={tierVariant[wallet.tier]}>{wallet.tier}</Badge>
            </div>
            <button className="mt-1 flex items-center gap-1 font-mono text-xs text-zinc-500 hover:text-zinc-300">
              {shortenAddress(wallet.address, 6)}
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">24h PnL</p>
            <p className="font-mono text-lg font-bold text-emerald-400">{formatUsd(wallet.pnl24h)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-lg bg-white/[0.03] p-2">
            <p className="text-zinc-500">7d PnL</p>
            <p className="font-mono font-semibold text-white">{formatUsd(wallet.pnl7d)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] p-2">
            <p className="text-zinc-500">ROI 30d</p>
            <p className="font-mono font-semibold text-purple-400">+{wallet.roi30d}%</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] p-2">
            <p className="text-zinc-500">Win Rate</p>
            <p className="font-mono font-semibold text-teal-400">{wallet.winRate}%</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            {wallet.recentBuys} buys / {wallet.recentSells} sells
          </span>
          <span>{wallet.followers.toLocaleString()} followers</span>
        </div>

        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1">Copy Trade</Button>
          <Button size="sm" variant="outline">Alert</Button>
        </div>
      </GlassCard>
    </motion.div>
  )
}

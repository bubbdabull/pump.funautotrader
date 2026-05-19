import { PageTransition } from '@/components/shared/PageTransition'
import { GlassCard } from '@/components/shared/GlassCard'
import { MOCK_PORTFOLIO } from '@/lib/mock-data'
import { formatUsd } from '@/lib/utils'

export function PortfolioPage() {
  const totalPnl = MOCK_PORTFOLIO.reduce((s, p) => s + p.pnl, 0)
  return (
    <PageTransition>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Portfolio</h1>
        <p className="text-sm text-zinc-500">Your positions & PnL</p>
      </div>
      <GlassCard className="mb-6" glow="purple">
        <p className="text-xs text-zinc-500">Total Unrealized PnL</p>
        <p className="font-mono text-3xl font-bold text-emerald-400">{formatUsd(totalPnl)}</p>
      </GlassCard>
      <div className="space-y-3">
        {MOCK_PORTFOLIO.map((p) => (
          <GlassCard key={p.mint}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={p.image} alt="" className="h-10 w-10 rounded-lg" />
                <div>
                  <p className="font-semibold text-white">{p.symbol}</p>
                  <p className="text-xs text-zinc-500">{p.amount.toLocaleString()} tokens</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-emerald-400">+{formatUsd(p.pnl)}</p>
                <p className="text-xs text-zinc-500">+{p.pnlPercent.toFixed(1)}%</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </PageTransition>
  )
}

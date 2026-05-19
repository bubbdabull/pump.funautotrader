import { PageTransition } from '@/components/shared/PageTransition'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAutoTraderStore } from '@/stores/autoTraderStore'
import { Play, Pause } from 'lucide-react'

const PRESETS = [
  {
    id: 'sniper',
    name: 'Early Curve Sniper',
    desc: 'Buy 5–35% bonding curve, low signal score',
    rules: { minBondingCurve: 5, maxBondingCurve: 35, maxSignalScore: 35, buyAmountSol: 0.15 },
  },
  {
    id: 'graduation',
    name: 'Graduation Play',
    desc: 'Buy 70–90% curve before Raydium migration',
    rules: { minBondingCurve: 70, maxBondingCurve: 90, maxSignalScore: 50, buyAmountSol: 0.25, pool: 'auto' as const },
  },
  {
    id: 'degen',
    name: 'Degen Micro',
    desc: 'Tiny buys on fresh launches',
    rules: { minBondingCurve: 3, maxBondingCurve: 20, maxSignalScore: 30, buyAmountSol: 0.05, slippage: 15 },
  },
]

export function StrategiesPage() {
  const { rules, setRules, toggleEnabled } = useAutoTraderStore()

  return (
    <PageTransition>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Strategies</h1>
          <p className="text-sm text-zinc-500">Rule presets for PumpPortal auto-trading</p>
        </div>
        <Button onClick={toggleEnabled} variant={rules.enabled ? 'outline' : 'default'}>
          {rules.enabled ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
          {rules.enabled ? 'Pause' : 'Activate'}
        </Button>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {PRESETS.map((p) => (
          <GlassCard key={p.id} hover>
            <h3 className="font-semibold text-white">{p.name}</h3>
            <p className="mt-1 text-sm text-zinc-500">{p.desc}</p>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => setRules({ ...p.rules, enabled: true, snipeNewTokens: true })}
            >
              Load preset
            </Button>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <h3 className="mb-4 font-semibold text-white">Custom rules</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-zinc-500">
            Buy amount (SOL)
            <Input
              type="number"
              className="mt-1"
              value={rules.buyAmountSol}
              onChange={(e) => setRules({ buyAmountSol: parseFloat(e.target.value) })}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Max market cap USD
            <Input
              type="number"
              className="mt-1"
              value={rules.maxMarketCapUsd}
              onChange={(e) => setRules({ maxMarketCapUsd: parseInt(e.target.value, 10) })}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Take profit %
            <Input
              type="number"
              className="mt-1"
              value={rules.autoSellTakeProfitPct}
              onChange={(e) => setRules({ autoSellTakeProfitPct: parseFloat(e.target.value) })}
            />
          </label>
        </div>
      </GlassCard>
    </PageTransition>
  )
}

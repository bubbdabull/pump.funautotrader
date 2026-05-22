import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Power, X, Zap, TrendingUp, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/stores/appStore'
import { useAutoTraderStore } from '@/stores/autoTraderStore'
import { useAutoTrader } from '@/hooks/useAutoTrader'
import { cn } from '@/lib/utils'
import type { PumpPortalPool } from '@/types'

const POOLS: PumpPortalPool[] = ['auto', 'pump', 'raydium', 'pump-amm', 'bonk']

export function AutoTradePanel() {
  const { setAutoTradePanelOpen } = useAppStore()
  const { rules, setRules, toggleEnabled, signals, executions } = useAutoTraderStore()
  useAutoTrader()

  return (
    <motion.aside
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex w-80 shrink-0 flex-col border-l border-white/5 glass lg:w-96"
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-teal-500">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Auto Trader</p>
            <p className="text-[10px] text-zinc-500">PumpPortal · no AI</p>
          </div>
        </div>
        <button onClick={() => setAutoTradePanelOpen(false)} className="text-zinc-500 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-white/5 p-4">
        <button
          onClick={toggleEnabled}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all',
            rules.enabled
              ? 'border-emerald-500/40 bg-emerald-500/10 glow-teal'
              : 'border-white/10 bg-white/5',
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Power className={cn('h-4 w-4', rules.enabled ? 'text-emerald-400' : 'text-zinc-500')} />
            {rules.enabled ? 'Auto-trade ON' : 'Auto-trade OFF'}
          </span>
          <Badge variant={rules.enabled ? 'success' : 'default'}>{rules.enabled ? 'LIVE' : 'PAUSED'}</Badge>
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <label className="text-zinc-500">
            Buy (SOL)
            <Input
              type="number"
              step="0.01"
              value={rules.buyAmountSol}
              onChange={(e) => setRules({ buyAmountSol: parseFloat(e.target.value) || 0.1 })}
              className="mt-1 h-8 font-mono"
            />
          </label>
          <label className="text-zinc-500">
            Slippage %
            <Input
              type="number"
              value={rules.slippage}
              onChange={(e) => setRules({ slippage: parseFloat(e.target.value) || 10 })}
              className="mt-1 h-8 font-mono"
            />
          </label>
          <label className="text-zinc-500">
            Curve min %
            <Input
              type="number"
              value={rules.minBondingCurve}
              onChange={(e) => setRules({ minBondingCurve: parseInt(e.target.value, 10) })}
              className="mt-1 h-8 font-mono"
            />
          </label>
          <label className="text-zinc-500">
            Curve max %
            <Input
              type="number"
              value={rules.maxBondingCurve}
              onChange={(e) => setRules({ maxBondingCurve: parseInt(e.target.value, 10) })}
              className="mt-1 h-8 font-mono"
            />
          </label>
          <label className="col-span-2 text-zinc-500">
            Pool
            <select
              value={rules.pool}
              onChange={(e) => setRules({ pool: e.target.value as PumpPortalPool })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
            >
              {POOLS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Zap className="h-3 w-3" /> Signals
        </p>
        <div className="mb-4 space-y-2">
          {signals.length === 0 && (
            <p className="text-xs text-zinc-600">Waiting for EV signals (≥3 trades per mint)…</p>
          )}
          <AnimatePresence initial={false}>
            {signals.slice(0, 8).map((s) => (
              <motion.div
                key={`${s.mint}-${s.timestamp}`}
                initial={{ opacity: 0, x: 16, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-2 text-xs shadow-[0_0_12px_rgba(16,185,129,0.08)]"
              >
                <p className="font-semibold text-white">
                  {s.symbol && s.symbol.length < 20 ? s.symbol : 'Signal'}
                </p>
                <p className="text-zinc-500">{s.reason}</p>
                {(s as { evScore?: number }).evScore != null && (
                  <p className="mt-1 font-mono text-[10px] text-emerald-400">
                    EV {(s as { evScore: number }).evScore.toFixed(2)}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <TrendingUp className="h-3 w-3" /> Executions
        </p>
        <div className="space-y-2">
          <AnimatePresence initial={false}>
          {executions.slice(0, 6).map((e) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              layout
              className={cn(
                'rounded-lg border p-2 text-xs',
                e.status === 'confirmed' && 'border-emerald-500/20',
                e.status === 'failed' && 'border-red-500/20',
                e.status === 'pending' && 'border-amber-500/20 animate-pulse',
              )}
            >
              <div className="flex justify-between">
                <span className="uppercase text-zinc-400">{e.side}</span>
                <Badge variant={e.status === 'confirmed' ? 'success' : e.status === 'failed' ? 'danger' : 'warning'}>
                  {e.status}
                </Badge>
              </div>
              <p className="font-mono text-zinc-300">{e.amountSol} SOL</p>
              {e.signature && (
                <a
                  href={`https://solscan.io/tx/${e.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  View tx
                </a>
              )}
              {e.error && (
                <p className="mt-1 flex items-center gap-1 text-red-400">
                  <AlertCircle className="h-3 w-3" /> {e.error}
                </p>
              )}
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}

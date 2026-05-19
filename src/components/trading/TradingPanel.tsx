import { useState } from 'react'
import { ArrowDownUp, Loader2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { Input } from '@/components/ui/input'
import { GlowingButton } from '@/components/shared/GlowingButton'
import { usePumpPortalTrade } from '@/hooks/usePumpPortalTrade'
import type { PumpToken, PumpPortalPool } from '@/types'

interface TradingPanelProps {
  token?: PumpToken
}

const POOLS: PumpPortalPool[] = ['auto', 'pump', 'raydium', 'pump-amm', 'bonk']

export function TradingPanel({ token }: TradingPanelProps) {
  const { publicKey } = useWallet()
  const { execute, loading, error } = usePumpPortalTrade()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0.1')
  const [slippage, setSlippage] = useState('12')
  const [priorityFee, setPriorityFee] = useState('0.0001')
  const [pool, setPool] = useState<PumpPortalPool>('auto')
  const [sellPercent, setSellPercent] = useState('100%')
  const [lastSig, setLastSig] = useState<string | null>(null)

  const handleTrade = async () => {
    if (!token || !publicKey) return
    const sig = await execute({
      mint: token.mint,
      action: side,
      amountSol: parseFloat(amount) || 0.1,
      slippage: parseFloat(slippage) || 10,
      priorityFee: parseFloat(priorityFee) || 0.0001,
      pool,
      sellPercent: side === 'sell' ? sellPercent : undefined,
    })
    setLastSig(sig)
  }

  return (
    <GlassCard glow="purple" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Trade {token?.symbol ?? 'Token'}</h3>
        <ArrowDownUp className="h-4 w-4 text-zinc-500" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`rounded-lg py-2 text-sm font-medium capitalize transition-all ${
              side === s
                ? s === 'buy'
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-red-600/20 text-red-400 border border-red-500/30'
                : 'bg-white/5 text-zinc-500'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs text-zinc-500">{side === 'buy' ? 'Amount (SOL)' : 'Sell amount'}</label>
        {side === 'buy' ? (
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 font-mono" />
        ) : (
          <select
            value={sellPercent}
            onChange={(e) => setSellPercent(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            {['25%', '50%', '75%', '100%'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-zinc-500">Slippage %</label>
          <Input value={slippage} onChange={(e) => setSlippage(e.target.value)} className="mt-1 font-mono" />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Priority fee</label>
          <Input value={priorityFee} onChange={(e) => setPriorityFee(e.target.value)} className="mt-1 font-mono" />
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500">Pool (PumpPortal)</label>
        <select
          value={pool}
          onChange={(e) => setPool(e.target.value as PumpPortalPool)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
        >
          {POOLS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <GlowingButton
        className="w-full"
        variant={side === 'buy' ? 'success' : 'danger'}
        disabled={!token || !publicKey || loading}
        onClick={handleTrade}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {!publicKey ? 'Connect Wallet' : side === 'buy' ? 'Buy' : 'Sell'} via PumpPortal
      </GlowingButton>

      {error && <p className="text-center text-xs text-red-400">{error}</p>}
      {lastSig && (
        <a
          href={`https://solscan.io/tx/${lastSig}`}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-purple-400 hover:underline"
        >
          View transaction
        </a>
      )}

      <p className="text-center text-[10px] text-zinc-600">
        Powered by{' '}
        <a href="https://pumpportal.fun/local-trading-api/trading-api" target="_blank" rel="noreferrer" className="text-teal-500">
          PumpPortal Local API
        </a>
      </p>
    </GlassCard>
  )
}

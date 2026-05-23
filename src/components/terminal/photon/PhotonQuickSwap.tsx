import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { usePumpPortalTrade } from '@/hooks/usePumpPortalTrade'
import { cn } from '@/lib/utils'
import type { PumpToken, PumpPortalPool } from '@/types'

const BUY_PRESETS = ['0.25', '0.5', '1', '2', '5', '10']
const SELL_PRESETS = ['25%', '50%', '100%']
const POOLS: PumpPortalPool[] = ['auto', 'pump', 'raydium']

interface PhotonQuickSwapProps {
  token?: PumpToken
}

export function PhotonQuickSwap({ token }: PhotonQuickSwapProps) {
  const { publicKey } = useWallet()
  const { execute, loading, error } = usePumpPortalTrade()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0.5')
  const slippage = '12'
  const [pool, setPool] = useState<PumpPortalPool>('auto')

  const run = async (amt?: string) => {
    if (!token || !publicKey) return
    const sol = side === 'buy' ? parseFloat(amt ?? amount) || 0.1 : undefined
    await execute({
      mint: token.mint,
      action: side,
      amountSol: sol ?? 0.1,
      slippage: parseFloat(slippage) || 12,
      priorityFee: 0.0002,
      pool,
      sellPercent: side === 'sell' ? amt ?? '100%' : undefined,
    })
  }

  return (
    <div className="photon-panel flex flex-col">
      <div className="photon-panel-header">Quick Swap</div>
      <div className="p-2.5">
        <div className="photon-segment mb-2.5">
          {(['buy', 'sell'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={cn(
                'photon-segment-btn capitalize',
                side === s && (s === 'buy' ? 'photon-segment-buy-active' : 'photon-segment-sell-active'),
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="photon-label mb-1.5">{side === 'buy' ? 'Quick Buy' : 'Quick Sell'}</p>
        <div className="grid grid-cols-3 gap-1">
          {(side === 'buy' ? BUY_PRESETS : SELL_PRESETS).map((p) => (
            <button
              key={p}
              type="button"
              disabled={!token || !publicKey || loading}
              onClick={() => {
                if (side === 'buy') {
                  setAmount(p)
                  void run(p)
                } else {
                  void run(p)
                }
              }}
              className={cn(
                'photon-preset-btn',
                side === 'buy' ? 'hover:border-emerald-500/40 hover:text-emerald-400' : 'hover:border-red-500/40 hover:text-red-400',
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex gap-1.5">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={side === 'sell'}
            className="photon-input flex-1 font-mono text-xs"
            placeholder="SOL"
          />
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value as PumpPortalPool)}
            className="photon-input w-24 text-xs"
          >
            {POOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={!token || !publicKey || loading}
          onClick={() => void run()}
          className={cn(
            'photon-cta mt-2.5 w-full',
            side === 'buy' ? 'photon-cta-buy' : 'photon-cta-sell',
          )}
        >
          {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : null}
          {!loading && (!publicKey ? 'Connect wallet' : side === 'buy' ? 'Buy Now' : 'Sell Now')}
        </button>

        {error && <p className="mt-2 text-center text-[10px] text-red-400">{error}</p>}
      </div>
    </div>
  )
}

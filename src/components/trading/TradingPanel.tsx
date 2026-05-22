import { useState } from 'react'
import { ArrowDownUp, Loader2 } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { TokenImage } from '@/components/shared/TokenImage'
import { Input } from '@/components/ui/input'
import { GlowingButton } from '@/components/shared/GlowingButton'
import { usePumpPortalTrade } from '@/hooks/usePumpPortalTrade'
import { formatUsd, formatHolders, formatSol, tokenVolumeSol } from '@/lib/utils'
import type { PumpToken, PumpPortalPool } from '@/types'
import { displayTokenName, displayTokenSymbol } from '@/lib/tokenDisplay'
import { shortenAddress } from '@/lib/utils'

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
    <GlassCard glow="purple" className="space-y-4 p-0 overflow-hidden">
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0">
              {token ? (
                <TokenImage
                  mint={token.mint}
                  symbol={token.symbol}
                  image={token.image}
                  uri={token.metadataUri}
                  size="md"
                />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-lg bg-white/5" />
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 className="text-base font-semibold text-white">
                {token ? displayTokenSymbol(token) : 'Select token'}
              </h3>
              <p className="truncate text-[11px] text-zinc-500">
                {token ? displayTokenName(token) : 'PumpPortal execution'}
              </p>
            </div>
          </div>
          <ArrowDownUp className="h-4 w-4 text-zinc-600" />
        </div>
        {token && (
          <p className="mt-2 truncate font-mono text-[10px] text-zinc-600">
            {shortenAddress(token.mint, 6)}
          </p>
        )}
        {token && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">MCap</p>
              <p className="font-mono text-xs text-white">{formatUsd(token.marketCap)}</p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Holders</p>
              <p className="font-mono text-xs text-white">{formatHolders(token.holders)}</p>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Vol</p>
              <p className="font-mono text-xs text-white">{formatSol(tokenVolumeSol(token))}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-1">
          {(['buy', 'sell'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-md py-2.5 text-sm font-semibold capitalize transition-all ${
                side === s
                  ? s === 'buy'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                    : 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            {side === 'buy' ? 'Size (SOL)' : 'Sell %'}
          </label>
          {side === 'buy' ? (
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 font-mono text-base"
            />
          ) : (
            <select
              value={sellPercent}
              onChange={(e) => setSellPercent(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-sm"
            >
              {['25%', '50%', '75%', '100%'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Slippage %
            </label>
            <Input
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Priority
            </label>
            <Input
              value={priorityFee}
              onChange={(e) => setPriorityFee(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Route
          </label>
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value as PumpPortalPool)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm"
          >
            {POOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <GlowingButton
          className="w-full py-3 text-sm font-semibold"
          variant={side === 'buy' ? 'success' : 'danger'}
          disabled={!token || !publicKey || loading}
          onClick={handleTrade}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {!publicKey ? 'Connect wallet' : side === 'buy' ? 'Execute buy' : 'Execute sell'}
        </GlowingButton>

        {error && <p className="text-center text-xs text-red-400">{error}</p>}
        {lastSig && (
          <a
            href={`https://solscan.io/tx/${lastSig}`}
            target="_blank"
            rel="noreferrer"
            className="block text-center text-xs text-violet-400 hover:underline"
          >
            View on Solscan
          </a>
        )}
      </div>
    </GlassCard>
  )
}

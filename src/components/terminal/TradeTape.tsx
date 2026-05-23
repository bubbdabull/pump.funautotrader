import { memo, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRegistryTrades } from '@/hooks/useRegistry'
import { cn, formatSol } from '@/lib/utils'

interface TradeTapeProps {
  mint: string
  maxRows?: number
}

function TradeTapeInner({ mint, maxRows = 14 }: TradeTapeProps) {
  const { data: trades } = useRegistryTrades(mint)
  const list = trades.slice(0, maxRows)
  const prevSig = useRef('')

  useEffect(() => {
    if (list[0]?.signature) prevSig.current = list[0].signature
  }, [list])

  if (!mint) {
    return (
      <p className="px-3 py-4 text-center text-[11px] text-zinc-600">Select a token for live tape</p>
    )
  }

  if (list.length === 0) {
    return (
      <div className="terminal-warmup px-3 py-6 text-center text-[11px] text-zinc-500">
        Waiting for trade ticks…
      </div>
    )
  }

  return (
    <div className="max-h-36 overflow-hidden border-t border-white/[0.06] bg-black/30">
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">
        <span>Trade tape</span>
        <span className="font-mono">{list.length} recent</span>
      </div>
      <ul className="divide-y divide-white/[0.03]">
        <AnimatePresence initial={false}>
          {list.map((t) => (
            <motion.li
              key={t.signature}
              layout
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'flex items-center justify-between px-3 py-1 font-mono text-[11px]',
                t.side === 'buy' ? 'terminal-tape-buy' : 'terminal-tape-sell',
              )}
            >
              <span className={t.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                {t.side.toUpperCase()}
              </span>
              <span className="text-zinc-400">{formatSol(t.solAmount)}</span>
              <span className="text-zinc-600">{t.wallet.slice(0, 4)}…</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

export const TradeTape = memo(TradeTapeInner)

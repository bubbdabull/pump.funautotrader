import { memo, useMemo, useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { Search } from 'lucide-react'
import { cn, formatUsd, tokenVolumeSol } from '@/lib/utils'
import { TokenImage } from '@/components/shared/TokenImage'
import { tokenMediaProps } from '@/lib/tokenMediaProps'
import { displayTokenSymbol } from '@/lib/tokenDisplay'
import type { PumpToken } from '@/types'

type SortKey = 'age' | 'mcap' | 'volume' | 'txns'

interface PhotonWatchlistProps {
  tokens: PumpToken[]
  selectedMint: string
  onSelect: (mint: string) => void
  isLoading: boolean
  streamConnected: boolean
}

function PhotonWatchlistInner({
  tokens,
  selectedMint,
  onSelect,
  isLoading,
  streamConnected,
}: PhotonWatchlistProps) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('age')

  const sorted = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let list = q
      ? tokens.filter(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.mint.toLowerCase().includes(q),
        )
      : [...tokens]

    list.sort((a, b) => {
      switch (sort) {
        case 'mcap':
          return b.marketCap - a.marketCap
        case 'volume':
          return tokenVolumeSol(b) - tokenVolumeSol(a)
        case 'txns':
          return (b.trades1m ?? 0) - (a.trades1m ?? 0)
        case 'age':
        default:
          return new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime()
      }
    })
    return list
  }, [tokens, filter, sort])

  return (
    <div className="photon-panel flex h-full min-h-0 flex-col">
      <div className="photon-panel-header">Watching</div>
      <div className="border-b border-white/[0.05] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-600" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search"
            className="photon-input w-full py-1.5 pl-7 text-xs"
          />
        </div>
        <div className="mt-2 flex gap-0.5">
          {(
            [
              ['age', 'Age'],
              ['mcap', 'MC'],
              ['volume', 'Vol'],
              ['txns', 'Txns'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={cn(
                'flex-1 rounded py-1 text-[9px] font-semibold uppercase tracking-wide',
                sort === key
                  ? 'bg-[#1a3d32] text-emerald-400'
                  : 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_44px_52px_40px] gap-1 border-b border-white/[0.05] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
        <span>Token</span>
        <span className="text-right">MC</span>
        <span className="text-right">Vol</span>
        <span className="text-right">Tx</span>
      </div>

      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full w-full">
          {isLoading ? (
            <div className="space-y-px p-1">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="photon-skeleton h-9" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="photon-warmup px-3 py-12 text-center text-[11px] text-zinc-500">
              {streamConnected ? 'Warming up market data…' : 'Reconnecting stream…'}
            </div>
          ) : (
            <div>
              {sorted.map((token) => (
                <PhotonWatchRow
                  key={token.mint}
                  token={token}
                  selected={token.mint === selectedMint}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="w-1 bg-transparent">
          <ScrollArea.Thumb className="rounded-full bg-emerald-500/30" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      <div className="border-t border-white/[0.05] px-2 py-1 font-mono text-[9px] text-zinc-600">
        {sorted.length} tokens
      </div>
    </div>
  )
}

function PhotonWatchRow({
  token,
  selected,
  onSelect,
}: {
  token: PumpToken
  selected: boolean
  onSelect: (mint: string) => void
}) {
  const active = token.isActive
  return (
    <button
      type="button"
      onClick={() => onSelect(token.mint)}
      className={cn(
        'grid w-full grid-cols-[1fr_44px_52px_40px] items-center gap-1 border-b border-white/[0.03] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]',
        selected && 'photon-row-selected',
        active && !selected && 'bg-emerald-500/[0.04]',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <TokenImage {...tokenMediaProps(token)} size="xs" />
        <span className="truncate text-[11px] font-semibold text-zinc-200">
          {displayTokenSymbol(token)}
        </span>
        {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
      </span>
      <span className="truncate text-right font-mono text-[10px] text-zinc-400">
        {formatUsd(token.marketCap).replace('$', '')}
      </span>
      <span className="text-right font-mono text-[10px] text-zinc-500">
        {tokenVolumeSol(token).toFixed(1)}
      </span>
      <span className="text-right font-mono text-[10px] text-zinc-500">{token.trades1m ?? 0}</span>
    </button>
  )
}

export const PhotonWatchlist = memo(PhotonWatchlistInner)

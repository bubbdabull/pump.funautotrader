import { useCallback, useMemo, useRef, useState } from 'react'
import type { StreamToken } from '@/domain/tokens/tokenTypes'
import { cn, formatUsd } from '@/lib/utils'
import { formatDistanceToNowStrict } from 'date-fns'

const ROW_H = 44

type SortKey = 'volume' | 'age' | 'holders' | 'momentum' | 'mcap'

interface VirtualFeedTableProps {
  tokens: StreamToken[]
  selectedMint: string | null
  onSelect: (mint: string) => void
}

export function VirtualFeedTable({ tokens, selectedMint, onSelect }: VirtualFeedTableProps) {
  const [sort, setSort] = useState<SortKey>('volume')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(480)

  const sorted = useMemo(() => {
    const copy = [...tokens]
    switch (sort) {
      case 'volume':
        return copy.sort((a, b) => (b.volume5mSol ?? 0) - (a.volume5mSol ?? 0))
      case 'holders':
        return copy.sort((a, b) => b.holders - a.holders)
      case 'momentum':
        return copy.sort((a, b) => b.momentumScore - a.momentumScore)
      case 'mcap':
        return copy.sort((a, b) => b.marketCap - a.marketCap)
      case 'age':
        return copy.sort(
          (a, b) => new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime(),
        )
      default:
        return copy
    }
  }, [tokens, sort])

  const totalH = sorted.length * ROW_H
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4)
  const visibleCount = Math.ceil(viewportH / ROW_H) + 8
  const end = Math.min(sorted.length, start + visibleCount)
  const slice = sorted.slice(start, end)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    setViewportH(el.clientHeight)
  }, [])

  return (
    <div className="desk-feed flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-white/5 px-2 py-1.5">
        {(
          [
            ['volume', 'Vol'],
            ['age', 'Age'],
            ['holders', 'Holders'],
            ['momentum', 'Mom'],
            ['mcap', 'MCap'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-semibold uppercase',
              sort === key ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ contain: 'strict' }}
      >
        {sorted.length === 0 ? (
          <p className="p-4 text-center text-xs text-zinc-500">
            Waiting for registry:patch stream…
          </p>
        ) : (
          <div style={{ height: totalH, position: 'relative' }}>
            {slice.map((t, i) => {
              const idx = start + i
              const y = idx * ROW_H
              return (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => onSelect(t.mint)}
                  className={cn(
                    'absolute left-0 right-0 flex items-center gap-2 border-b border-white/5 px-2 text-left text-[11px]',
                    selectedMint === t.mint ? 'bg-violet-600/25' : 'hover:bg-white/5',
                  )}
                  style={{ top: y, height: ROW_H }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-white">{t.symbol}</span>
                      {t.displayStatus === 'EARLY' && (
                        <span className="rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">
                          EARLY
                        </span>
                      )}
                      {t.displayStatus === 'LIVE' && (
                        <span className="rounded bg-emerald-500/20 px-1 text-[9px] text-emerald-300">
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-zinc-500">{t.name}</div>
                  </div>
                  <div className="shrink-0 text-right font-mono">
                    <div className="text-zinc-300">{formatUsd(t.marketCap)}</div>
                    <div className="text-[10px] text-zinc-500">
                      {formatDistanceToNowStrict(new Date(t.launchedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="w-10 shrink-0 text-right font-mono text-violet-300">
                    {Math.round(t.intelScore)}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

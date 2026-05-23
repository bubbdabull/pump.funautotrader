import { memo, useMemo, useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { Search } from 'lucide-react'
import { TerminalFeedRow } from '@/components/terminal/TerminalFeedRow'
import { Input } from '@/components/ui/input'
import type { PumpToken } from '@/types'

interface TerminalFeedPanelProps {
  tokens: PumpToken[]
  selectedMint: string
  onSelect: (mint: string) => void
  isLoading: boolean
  streamConnected: boolean
}

function TerminalFeedPanelInner({
  tokens,
  selectedMint,
  onSelect,
  isLoading,
  streamConnected,
}: TerminalFeedPanelProps) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tokens
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.mint.toLowerCase().includes(q),
    )
  }, [tokens, filter])

  return (
    <div className="terminal-panel flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="h-8 border-white/10 bg-black/40 pl-8 text-xs"
          />
        </div>
        <p className="mt-1 px-1 font-mono text-[10px] text-zinc-600">{filtered.length} tokens</p>
      </div>

      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full w-full">
          {isLoading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="terminal-skeleton h-12 rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="terminal-warmup flex flex-col items-center gap-2 px-4 py-12 text-center">
              <div className="h-10 w-10 animate-pulse rounded-full bg-violet-500/20" />
              <p className="text-xs text-zinc-400">
                {streamConnected
                  ? 'Warming up market data…'
                  : 'Reconnecting to live stream…'}
              </p>
              <p className="text-[10px] text-zinc-600">Feed populates from registry patches</p>
            </div>
          ) : (
            <div className="pb-2">
              {filtered.map((token) => (
                <TerminalFeedRow
                  key={token.mint}
                  token={token}
                  selected={token.mint === selectedMint}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="w-1.5 bg-transparent p-0.5">
          <ScrollArea.Thumb className="rounded-full bg-violet-500/40" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  )
}

export const TerminalFeedPanel = memo(TerminalFeedPanelInner)

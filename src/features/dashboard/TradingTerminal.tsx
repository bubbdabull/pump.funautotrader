import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStreamStore } from '@/core/streamStore'
import { useRegistryLane } from '@/hooks/useRegistry'
import { useTokenSubscription } from '@/hooks/useTokenSubscription'
import { TopStatusBar } from '@/features/metrics/TopStatusBar'
import { VirtualFeedTable } from '@/ui/table/VirtualFeedTable'
import { TerminalChartPanel } from '@/features/chart/TerminalChartPanel'
import { TokenDetailPanel } from '@/features/watchlist/TokenDetailPanel'
import type { StreamToken } from '@/domain/tokens/tokenTypes'

export function TradingTerminal() {
  const { tokens, connectionStatus, displayMode, mode } = useRegistryLane('all')
  const streamTokens = useStreamStore(useShallow((s) => s.listTokens('all')))
  const [selectedMint, setSelectedMint] = useState<string | null>(null)

  useTokenSubscription(selectedMint ?? undefined)

  const feedTokens = useMemo(() => {
    if (streamTokens.length > 0) return streamTokens
    return tokens as StreamToken[]
  }, [streamTokens, tokens])

  const selected = useMemo(
    () => feedTokens.find((t) => t.mint === selectedMint) ?? feedTokens[0] ?? null,
    [feedTokens, selectedMint],
  )

  const activeMint = selected?.mint ?? null

  const banner =
    connectionStatus === 'OFFLINE' && displayMode === 'OFFLINE_MODE' ? (
      <div className="shrink-0 bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-200">
        Stream offline — showing last cached tokens ({feedTokens.length})
      </div>
    ) : feedTokens.length > 0 && mode === 'low_confidence' ? (
      <div className="shrink-0 bg-violet-500/10 px-3 py-1 text-center text-[11px] text-violet-200/90">
        Live stream active — early-stage tokens included (low confidence labels, not hidden)
      </div>
    ) : null

  return (
    <div className="desk-root flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#06070a]">
      <TopStatusBar />
      {banner}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[minmax(220px,280px)_1fr_minmax(220px,260px)]">
        <div className="desk-panel flex min-h-[280px] min-w-0 flex-col overflow-hidden lg:min-h-0">
          <div className="border-b border-white/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Live feed · {feedTokens.length}
          </div>
          <VirtualFeedTable
            tokens={feedTokens}
            selectedMint={activeMint}
            onSelect={setSelectedMint}
          />
        </div>
        <TerminalChartPanel mint={activeMint} />
        <TokenDetailPanel token={selected} />
      </div>
    </div>
  )
}

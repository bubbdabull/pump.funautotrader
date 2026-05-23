import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScannerFeed } from '@/hooks/useRegistry'
import { useRegistryToken } from '@/hooks/useRegistry'
import { useBatchedRegistryTick } from '@/hooks/useBatchedRegistry'
import { useTokenSubscription } from '@/hooks/useTokenSubscription'
import { useWsConnection, useWsReconnecting } from '@/hooks/useWsConnection'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { TerminalLiveStatus } from '@/components/terminal/TerminalLiveStatus'
import { TerminalFeedPanel } from '@/components/terminal/TerminalFeedPanel'
import { TerminalChartPanel } from '@/components/terminal/TerminalChartPanel'
import { TokenIntelPanel } from '@/components/terminal/TokenIntelPanel'
import { ensureArray } from '@/lib/ensureArray'
import type { ScannerLane } from '@/lib/feedQuality'
import type { PumpToken } from '@/types'

export function ProScannerTerminal() {
  const [lane, setLane] = useState<ScannerLane>('all')
  const [selectedMint, setSelectedMint] = useState('')

  useBatchedRegistryTick(150)

  const {
    data,
    isLoading,
    isFetching,
    dataUpdatedAt,
    wsConnected,
  } = useScannerFeed(lane)

  const tokens = useMemo(() => ensureArray<PumpToken>(data), [data])
  const hotCount = useMemo(() => tokens.filter((t) => t.isActive).length, [tokens])

  const { data: selectedToken } = useRegistryToken(selectedMint)
  useTokenSubscription(selectedMint)

  const wsLive = useWsConnection()
  const wsReconnecting = useWsReconnecting()
  const backend = useBackendStatus()
  const streamConnected = wsConnected || wsLive || backend.socketConnected

  const onSelect = useCallback((mint: string) => {
    setSelectedMint(mint)
  }, [])

  useEffect(() => {
    if (!selectedMint && tokens[0]) setSelectedMint(tokens[0].mint)
  }, [tokens, selectedMint])

  return (
    <div className="terminal-root flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col lg:h-[calc(100dvh-5.5rem)]">
      <TerminalLiveStatus
        lane={lane}
        onLane={setLane}
        wsConnected={streamConnected}
        reconnecting={wsReconnecting || isFetching}
        tokenCount={tokens.length}
        hotCount={hotCount}
        registryUpdatedAt={dataUpdatedAt}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[minmax(280px,320px)_1fr_minmax(300px,360px)]">
        <div className="hidden min-h-0 lg:block">
          <TerminalFeedPanel
            tokens={tokens}
            selectedMint={selectedMint}
            onSelect={onSelect}
            isLoading={isLoading && tokens.length === 0}
            streamConnected={streamConnected}
          />
        </div>

        <div className="min-h-[420px] min-w-0 lg:min-h-0">
          <TerminalChartPanel token={selectedToken} mint={selectedMint} />
        </div>

        <div className="hidden min-h-0 lg:block">
          <TokenIntelPanel token={selectedToken} mint={selectedMint} />
        </div>
      </div>

      {/* Mobile: compact feed strip */}
      <div className="max-h-40 shrink-0 overflow-hidden border-t border-white/[0.06] lg:hidden">
        <TerminalFeedPanel
          tokens={tokens.slice(0, 40)}
          selectedMint={selectedMint}
          onSelect={onSelect}
          isLoading={isLoading && tokens.length === 0}
          streamConnected={streamConnected}
        />
      </div>
    </div>
  )
}

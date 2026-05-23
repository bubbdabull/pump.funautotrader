import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScannerFeed } from '@/hooks/useRegistry'
import { useRegistryToken } from '@/hooks/useRegistry'
import { useBatchedRegistryTick } from '@/hooks/useBatchedRegistry'
import { useTokenSubscription } from '@/hooks/useTokenSubscription'
import { useWsConnection, useWsReconnecting } from '@/hooks/useWsConnection'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { TerminalLiveStatus } from '@/components/terminal/TerminalLiveStatus'
import { PhotonWatchlist } from '@/components/terminal/photon/PhotonWatchlist'
import { PhotonCenterPanel } from '@/components/terminal/photon/PhotonCenterPanel'
import { PhotonQuickSwap } from '@/components/terminal/photon/PhotonQuickSwap'
import { PhotonSecurityPanel } from '@/components/terminal/photon/PhotonSecurityPanel'
import { HolderBubbleMap } from '@/components/terminal/HolderBubbleMap'
import { useStreamStore } from '@/core/streamStore'
import { ensureArray } from '@/lib/ensureArray'
import type { ScannerLane } from '@/lib/feedQuality'
import type { PumpToken } from '@/types'

export function PhotonTerminal() {
  const [lane, setLane] = useState<ScannerLane>('all')
  const [selectedMint, setSelectedMint] = useState('')

  useBatchedRegistryTick(150)

  const { data, isLoading, isFetching, dataUpdatedAt, wsConnected } = useScannerFeed(lane)
  const tokens = useMemo(() => ensureArray<PumpToken>(data), [data])
  const hotCount = useMemo(() => tokens.filter((t) => t.isActive).length, [tokens])

  const { data: selectedToken } = useRegistryToken(selectedMint)
  const graph = useStreamStore((s) => (selectedMint ? s.walletGraphs[selectedMint] : undefined))
  useTokenSubscription(selectedMint)

  const wsLive = useWsConnection()
  const wsReconnecting = useWsReconnecting()
  const backend = useBackendStatus()
  const streamConnected = wsConnected || wsLive || backend.socketConnected

  const onSelect = useCallback((mint: string) => setSelectedMint(mint), [])

  useEffect(() => {
    if (!selectedMint && tokens[0]) setSelectedMint(tokens[0].mint)
  }, [tokens, selectedMint])

  return (
    <div className="photon-terminal flex h-full min-h-0 flex-col">
      <TerminalLiveStatus
        className="photon-topbar shrink-0"
        lane={lane}
        onLane={setLane}
        wsConnected={streamConnected}
        reconnecting={wsReconnecting || isFetching}
        tokenCount={tokens.length}
        hotCount={hotCount}
        registryUpdatedAt={dataUpdatedAt}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,280px)_1fr_minmax(260px,300px)]">
        <div className="hidden min-h-0 lg:block">
          <PhotonWatchlist
            tokens={tokens}
            selectedMint={selectedMint}
            onSelect={onSelect}
            isLoading={isLoading && tokens.length === 0}
            streamConnected={streamConnected}
          />
        </div>

        <div className="min-h-[480px] min-w-0 lg:min-h-0">
          <PhotonCenterPanel token={selectedToken} mint={selectedMint} />
        </div>

        <div className="hidden min-h-0 flex-col gap-2 lg:flex">
          <PhotonQuickSwap token={selectedToken} />
          <PhotonSecurityPanel token={selectedToken} />
          <div className="photon-panel min-h-[160px] flex-1 overflow-hidden">
            <div className="photon-panel-header">Holders</div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <HolderBubbleMap graph={graph} token={selectedToken} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-36 shrink-0 border-t border-white/[0.05] lg:hidden">
        <PhotonWatchlist
          tokens={tokens.slice(0, 30)}
          selectedMint={selectedMint}
          onSelect={onSelect}
          isLoading={isLoading && tokens.length === 0}
          streamConnected={streamConnected}
        />
      </div>
    </div>
  )
}

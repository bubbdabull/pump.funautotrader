import { useMemo, useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStreamStore } from '@/core/streamStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useQuantStore } from '@/stores/quantStore'
import { useTokenSubscription } from '@/hooks/useTokenSubscription'
import { useSubscriptionTier } from '@/hooks/useSubscriptionTier'
import type { PumpToken } from '@/types'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { FeedTrade } from '@/services/api'
import { countHighConfidence } from '@/lib/intelligence'
import type { ScannerLane } from '@/lib/feedQuality'
import { mergeQuantHolders } from '@/hooks/useQuantScanner'
import type { StreamToken } from '@/domain/tokens/tokenTypes'

export type RegistryLanePayload = {
  tokens: StreamToken[]
  mode: 'active' | 'low_confidence' | 'tradeable'
  tradeableCount: number
  displayMode: 'LIVE_STREAM' | 'ANALYTICS_VIEW' | 'OFFLINE_MODE'
  connectionStatus: 'CONNECTED' | 'DEGRADED' | 'OFFLINE'
}

/** WebSocket-driven lane feed — streamStore is single source of truth */
export function useRegistryLane(lane: ScannerLane = 'all') {
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false)
  const tier = useSubscriptionTier()

  useEffect(() => {
    const t = window.setTimeout(() => setBootstrapTimedOut(true), 8_000)
    return () => clearTimeout(t)
  }, [])

  const version = useStreamStore((s) => s.version)
  const updatedAt = useStreamStore((s) => s.updatedAt)
  const wsConnected = useStreamStore((s) => s.wsConnected)
  const connectionStatus = useStreamStore((s) => s.connectionStatus)
  const displayMode = useStreamStore((s) => s.displayMode)
  const tokenMapSize = useStreamStore((s) => s.tokens.size)

  const reconnecting = useRealtimeStore((s) => s.reconnecting)
  const quantByMint = useQuantStore(useShallow((s) => s.byMint))

  const rawTokens = useStreamStore(
    useShallow((s) => s.listTokens(lane, tier)),
  )

  const payload = useMemo((): RegistryLanePayload => {
    const tradeableCount = countHighConfidence(rawTokens as PumpToken[])
    const mode: RegistryLanePayload['mode'] =
      tradeableCount > 0 ? 'active' : 'low_confidence'
    return {
      tokens: rawTokens,
      mode,
      tradeableCount,
      displayMode,
      connectionStatus,
    }
  }, [rawTokens, displayMode, connectionStatus, version])

  const tokens = useMemo(
    () => mergeQuantHolders(payload.tokens) as StreamToken[],
    [payload.tokens, quantByMint],
  )

  const streamLive = wsConnected && connectionStatus !== 'OFFLINE'
  const isLoading = tokens.length === 0 && !bootstrapTimedOut && !streamLive && updatedAt === 0

  return {
    data: tokens,
    tokens,
    mode: payload.mode,
    displayMode: payload.displayMode,
    connectionStatus: payload.connectionStatus,
    tradeableCount: payload.tradeableCount,
    subscriptionTier: tier,
    isLoading,
    isFetching: reconnecting,
    isError: false,
    error: null as Error | null,
    dataUpdatedAt: updatedAt,
    wsConnected,
    restSync: false,
    tokenMapSize,
  }
}

export function useRegistryToken(mint: string) {
  useTokenSubscription(mint)
  const tier = useSubscriptionTier()
  const token = useStreamStore((s) => s.getToken(mint))
  const version = useStreamStore((s) => s.version)
  const quantMint = useQuantStore((s) => s.byMint[mint])

  const merged = useMemo(() => {
    if (!token) return undefined
    const [withHolders] = mergeQuantHolders([token as PumpToken])
    return withHolders as StreamToken
  }, [token, version, quantMint, tier])

  return {
    data: merged,
    isLoading: !merged,
    isError: false,
    error: null as Error | null,
  }
}

export function useRegistryChart(mint: string, intervalMs = 5_000) {
  useTokenSubscription(mint)
  const chart = useStreamStore((s) => s.getChart(mint, intervalMs))
  const chartVersion = useStreamStore((s) => s.charts[`${mint}::${intervalMs}`]?.chartSeq ?? 0)

  const data = useMemo((): TokenChartSeries | undefined => {
    if (!chart) return undefined
    return { ...chart, intervalMs: chart.intervalMs ?? intervalMs }
  }, [chart, chartVersion, intervalMs])

  return {
    data,
    isLoading: !data && Boolean(mint),
    isError: false,
  }
}

export function useRegistryTrades(mint: string) {
  useTokenSubscription(mint)
  const trades = useStreamStore((s) => s.getTrades(mint))
  const version = useStreamStore((s) => s.version)

  return {
    data: (trades ?? []) as FeedTrade[],
    isLoading: false,
    version,
  }
}

export { useRegistryLane as useScannerFeed, useRegistryChart as useTokenChart }

export function useRegistryRankings(limit = 50) {
  const signals = useStreamStore((s) => s.signals)
  const version = useStreamStore((s) => s.version)

  return useMemo(() => {
    return Object.values(signals)
      .sort((a, b) => b.tradeConfidenceScore - a.tradeConfidenceScore)
      .slice(0, limit)
      .map((s) => ({ mint: s.mint, confidence: s.tradeConfidenceScore }))
  }, [signals, version, limit])
}

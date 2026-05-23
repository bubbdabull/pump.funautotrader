import { useMemo, useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useQuantStore } from '@/stores/quantStore'
import { useTokenSubscription } from '@/hooks/useTokenSubscription'
import { useSubscriptionTier } from '@/hooks/useSubscriptionTier'
import type { PumpToken } from '@/types'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { FeedTrade } from '@/services/api'
import {
  rankIntelligenceLane,
  isInvalidSignal,
  countHighConfidence,
  applySubscriptionTier,
  limitFreeTierVisible,
} from '@/lib/intelligence'
import type { ScannerLane } from '@/lib/feedQuality'
import { mergeQuantHolders } from '@/hooks/useQuantScanner'

export type RegistryLanePayload = {
  tokens: PumpToken[]
  mode: 'active' | 'low_confidence' | 'tradeable'
  tradeableCount: number
}

/** Visualization-only lane ranking — no binary hide except INVALID_SIGNAL. */
function applyLane(tokens: PumpToken[], lane: ScannerLane, tier: 'free' | 'pro'): RegistryLanePayload {
  const visible = tokens.filter((t) => !isInvalidSignal(t))
  const ranked = rankIntelligenceLane(visible, lane, 120)
  const tiered = ranked.map((t) => applySubscriptionTier(t, tier))
  const limited = limitFreeTierVisible(tiered, tier)
  const tradeableCount = countHighConfidence(visible)

  return {
    tokens: limited,
    mode: tradeableCount > 0 ? 'active' : 'low_confidence',
    tradeableCount,
  }
}

/** WebSocket-driven lane feed — single registry source, no REST polling. */
export function useRegistryLane(lane: ScannerLane = 'all') {
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false)
  const tier = useSubscriptionTier()

  useEffect(() => {
    const t = window.setTimeout(() => setBootstrapTimedOut(true), 5_000)
    return () => clearTimeout(t)
  }, [])

  const { byMint, version, updatedAt, wsConnected } = useTokenRegistryStore(
    useShallow((s) => ({
      byMint: s.byMint,
      version: s.version,
      updatedAt: s.updatedAt,
      wsConnected: s.wsConnected,
    })),
  )

  const reconnecting = useRealtimeStore((s) => s.reconnecting)
  const quantByMint = useQuantStore(useShallow((s) => s.byMint))

  const payload = useMemo(() => {
    const all = Object.values(byMint)
    return applyLane(all, lane, tier)
  }, [byMint, version, lane, tier])

  const tokens = useMemo(
    () => mergeQuantHolders(payload.tokens),
    [payload.tokens, quantByMint],
  )

  return {
    data: tokens,
    tokens,
    displayMode: payload.mode,
    tradeableCount: payload.tradeableCount,
    subscriptionTier: tier,
    isLoading: tokens.length === 0 && !bootstrapTimedOut && !updatedAt,
    isFetching: reconnecting,
    isError: false,
    error: null as Error | null,
    dataUpdatedAt: updatedAt,
    wsConnected,
    restSync: false,
  }
}

export function useRegistryToken(mint: string) {
  useTokenSubscription(mint)
  const tier = useSubscriptionTier()
  const token = useTokenRegistryStore((s) => s.byMint[mint])
  const version = useTokenRegistryStore((s) => s.version)
  const quantMint = useQuantStore((s) => s.byMint[mint])

  const merged = useMemo(() => {
    if (!token) return undefined
    const [withHolders] = mergeQuantHolders([token])
    return applySubscriptionTier(withHolders, tier)
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
  const chart = useTokenRegistryStore((s) => s.charts[`${mint}::${intervalMs}`])
  const chartVersion = useTokenRegistryStore(
    (s) => s.charts[`${mint}::${intervalMs}`]?.chartSeq ?? s.charts[`${mint}::${intervalMs}`]?.candles.length ?? 0,
  )

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
  const trades = useTokenRegistryStore((s) => s.trades[mint])
  const version = useTokenRegistryStore((s) => s.version)

  return {
    data: (trades ?? []) as FeedTrade[],
    isLoading: false,
    version,
  }
}

export { useRegistryLane as useScannerFeed, useRegistryChart as useTokenChart }

export function useRegistryRankings(limit = 50) {
  const signals = useTokenRegistryStore((s) => s.signals)
  const version = useTokenRegistryStore((s) => s.version)

  return useMemo(() => {
    return Object.values(signals)
      .sort((a, b) => b.tradeConfidenceScore - a.tradeConfidenceScore)
      .slice(0, limit)
      .map((s) => ({ mint: s.mint, confidence: s.tradeConfidenceScore }))
  }, [signals, version, limit])
}

import { useMemo, useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useQuantStore } from '@/stores/quantStore'
import { useTokenSubscription } from '@/hooks/useTokenSubscription'
import type { PumpToken } from '@/types'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { FeedTrade } from '@/services/api'
import {
  passesAlphaFilter,
  passesActiveScannerFilter,
  passesTradeableFilter,
  isGraduatingSoon,
  resolveDisplayFeed,
  tradeQualityScore,
  type FeedDisplayMode,
  type ScannerLane,
} from '@/lib/feedQuality'
import { mergeQuantHolders } from '@/hooks/useQuantScanner'

export type RegistryLanePayload = {
  tokens: PumpToken[]
  mode: FeedDisplayMode
  tradeableCount: number
}

function applyLane(tokens: PumpToken[], lane: ScannerLane): RegistryLanePayload {
  if (lane === 'all' || lane === 'active') {
    const tradeableCount = tokens.filter(passesTradeableFilter).length
    const list =
      lane === 'active' ? tokens.filter(passesActiveScannerFilter) : tokens
    return { tokens: list, mode: 'active', tradeableCount }
  }
  if (lane === 'graduating') {
    const list = tokens
      .filter(isGraduatingSoon)
      .sort((a, b) => b.bondingCurvePercent - a.bondingCurvePercent)
    return {
      tokens: list,
      mode: 'watchlist_fallback',
      tradeableCount: tokens.filter(passesTradeableFilter).length,
    }
  }
  if (lane === 'alpha') {
    const list = [...tokens]
      .filter(passesAlphaFilter)
      .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
      .slice(0, 60)
    return {
      tokens: list,
      mode: 'watchlist_fallback',
      tradeableCount: tokens.filter(passesTradeableFilter).length,
    }
  }
  const resolved = resolveDisplayFeed(tokens, 80)
  return {
    tokens: resolved.tokens,
    mode: resolved.mode,
    tradeableCount: resolved.tradeableCount,
  }
}

/** WebSocket-driven lane feed — single registry source, no REST polling. */
export function useRegistryLane(lane: ScannerLane = 'all') {
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false)

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
    return applyLane(all, lane)
  }, [byMint, version, lane])

  const tokens = useMemo(
    () => mergeQuantHolders(payload.tokens),
    [payload.tokens, quantByMint],
  )

  return {
    data: tokens,
    tokens,
    displayMode: payload.mode,
    tradeableCount: payload.tradeableCount,
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
  const token = useTokenRegistryStore((s) => s.byMint[mint])
  const version = useTokenRegistryStore((s) => s.version)
  const quantMint = useQuantStore((s) => s.byMint[mint])

  const merged = useMemo(() => {
    if (!token) return undefined
    return mergeQuantHolders([token])[0]
  }, [token, version, quantMint])

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

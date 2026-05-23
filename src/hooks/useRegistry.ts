import { useMemo, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'
import { useQuantStore } from '@/stores/quantStore'
import { wsService } from '@/services/websocket'
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

/** WebSocket-driven lane feed — single registry source. */
export function useRegistryLane(lane: ScannerLane = 'all') {
  useEffect(() => {
    wsService.connect()
  }, [])

  const { byMint, version, updatedAt, wsConnected } = useTokenRegistryStore(
    useShallow((s) => ({
      byMint: s.byMint,
      version: s.version,
      updatedAt: s.updatedAt,
      wsConnected: s.wsConnected,
    })),
  )

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
    isLoading: !wsConnected && tokens.length === 0,
    isFetching: false,
    isError: false,
    error: null as Error | null,
    dataUpdatedAt: updatedAt,
    wsConnected,
  }
}

export function useRegistryToken(mint: string) {
  const token = useTokenRegistryStore((s) => s.byMint[mint])
  const version = useTokenRegistryStore((s) => s.version)

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)
  }, [mint])

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
  const chart = useTokenRegistryStore((s) => s.charts[mint])

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)
  }, [mint])

  const data = useMemo((): TokenChartSeries | undefined => {
    if (!chart) return undefined
    return { ...chart, intervalMs: chart.intervalMs ?? intervalMs }
  }, [chart, intervalMs])

  return {
    data,
    isLoading: !data && Boolean(mint),
    isError: false,
  }
}

export function useRegistryTrades(mint: string) {
  const trades = useTokenRegistryStore((s) => s.trades[mint])
  const version = useTokenRegistryStore((s) => s.version)

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)
  }, [mint])

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

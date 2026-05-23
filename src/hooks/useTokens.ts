import { useMemo } from 'react'
import type { PumpToken } from '@/types'
import {
  useRegistryLane,
  useRegistryToken,
  useRegistryTrades,
} from '@/hooks/useRegistry'

export function useTokenFeed() {
  const lane = useRegistryLane('alpha')
  return {
    data: lane.tokens,
    isLoading: lane.isLoading,
    isError: lane.isError,
    error: lane.error,
    isFetching: lane.isFetching,
    dataUpdatedAt: lane.dataUpdatedAt,
  }
}

export function useFeedStats() {
  const { tokens } = useRegistryLane('all')
  return {
    data: useMemo(() => {
      const list = tokens
      const active = list.filter((t) => t.isActive).length
      const avgSignal =
        list.length > 0
          ? list.reduce((s, t) => s + (t.signalScore ?? 50), 0) / list.length
          : 0
      return {
        activeTokens: active,
        totalVolume24h: list.reduce((s, t) => s + (t.volume24h ?? 0), 0),
        totalMarketCap: list.reduce((s, t) => s + (t.marketCap ?? 0), 0),
        newTokensLastHour: list.filter(
          (t) => Date.now() - new Date(t.launchedAt).getTime() < 3_600_000,
        ).length,
        avgSignalScore: Math.round(avgSignal),
      }
    }, [tokens]),
    isLoading: false,
  }
}

export function useToken(mint: string) {
  return useRegistryToken(mint)
}

export function useTokenTrades(mint: string) {
  const { data } = useRegistryTrades(mint)
  return { data, isLoading: false, isError: false, error: null }
}

export function sortTokens(tokens: PumpToken[], sort: string): PumpToken[] {
  const copy = [...tokens]
  switch (sort) {
    case 'marketCap':
      return copy.sort((a, b) => b.marketCap - a.marketCap)
    case 'volume':
      return copy.sort((a, b) => b.volume24h - a.volume24h)
    case 'risk':
      return copy.sort(
        (a, b) =>
          (a.signalScore ?? a.aiRiskScore ?? 50) - (b.signalScore ?? b.aiRiskScore ?? 50),
      )
    case 'momentum':
      return copy.sort((a, b) => b.momentumScore - a.momentumScore)
    case 'newest':
      return copy.sort(
        (a, b) => new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime(),
      )
    case 'curve':
      return copy.sort((a, b) => b.bondingCurvePercent - a.bondingCurvePercent)
    default:
      return copy
  }
}

export { useRegistryLane as useScannerFeed, useRegistryChart as useTokenChart } from '@/hooks/useRegistry'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tokenApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import type { PumpToken } from '@/types'
import { ensureArray } from '@/lib/ensureArray'
import { passesTradeableFilter, type FeedDisplayMode } from '@/lib/feedQuality'
import type { ScannerLane } from '@/lib/feedQuality'
import { mergeQuantHolders } from '@/hooks/useQuantScanner'
import type { TokenChartSeries } from '@/lib/chartTypes'
import { API_BASE } from '@/lib/apiConfig'
import { mergePumpTokens, normalizePumpToken, normalizePumpTokens } from '@/lib/normalizeToken'

type ScannerPayload = {
  tokens: PumpToken[]
  mode: FeedDisplayMode
  tradeableCount: number
}

function buildPayload(tokens: PumpToken[], lane: ScannerLane): ScannerPayload {
  const list = normalizePumpTokens(tokens).filter((t) => t.mint.length >= 32)
  const tradeableCount = list.filter(passesTradeableFilter).length
  if (lane === 'tradeable') {
    return {
      tokens: list,
      mode: tradeableCount > 0 ? 'tradeable' : 'watchlist_fallback',
      tradeableCount,
    }
  }
  return { tokens: list, mode: 'active', tradeableCount }
}

function mergeIntoList(list: PumpToken[], token: PumpToken, max = 100): PumpToken[] {
  const t = normalizePumpToken(token)
  const idx = list.findIndex((x) => x.mint === t.mint)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = mergePumpTokens(next[idx], t)
    return next
  }
  return [t, ...list].slice(0, max)
}

export function useScannerFeed(lane: ScannerLane = 'all') {
  const queryClient = useQueryClient()
  const key = ['tokens', 'scanner', lane] as const

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        const raw =
          lane === 'graduating'
            ? await tokenApi.graduating()
            : await tokenApi.feed(lane)
        const payload = buildPayload(ensureArray<PumpToken>(raw), lane)
        if (payload.tokens.length === 0 && lane !== 'graduating') {
          const fallback = await tokenApi.feed('all')
          return buildPayload(ensureArray<PumpToken>(fallback), lane)
        }
        return payload
      } catch (err) {
        const msg = (err as Error).message || 'Feed request failed'
        throw new Error(`${msg} (${API_BASE}/tokens/feed?lane=${lane})`)
      }
    },
    refetchInterval: 3_000,
    staleTime: 1_000,
    refetchOnWindowFocus: true,
    retry: 2,
  })

  useEffect(() => {
    wsService.connect()

    const patchOne = (raw: PumpToken) => {
      queryClient.setQueryData<ScannerPayload>(key, (prev) => {
        const list = prev?.tokens ?? []
        const next = mergeIntoList(list, raw)
        return buildPayload(next, lane)
      })
    }

    const unsubPatch = wsService.onFeedPatch(patchOne)
    const unsubToken = wsService.onTokenUpdate(patchOne)
    const unsubPrepend = wsService.onFeedPrepend(patchOne)
    const unsubPortal = wsService.onPumpPortalToken(patchOne)

    return () => {
      unsubPatch()
      unsubToken()
      unsubPrepend()
      unsubPortal()
    }
  }, [queryClient, lane])

  const tokens = query.data?.tokens?.length
    ? mergeQuantHolders(query.data.tokens)
    : query.data?.tokens ?? []

  return {
    ...query,
    data: query.isSuccess ? tokens : undefined,
    displayMode: query.data?.mode ?? 'watchlist_fallback',
    tradeableCount: query.data?.tradeableCount ?? 0,
  }
}

export function useTokenChart(mint: string, intervalMs = 5_000) {
  const queryClient = useQueryClient()
  const key = ['tokens', mint, 'chart', intervalMs] as const

  const query = useQuery<TokenChartSeries>({
    queryKey: key,
    queryFn: () => tokenApi.chart(mint, intervalMs),
    enabled: !!mint,
    refetchInterval: 2_000,
    staleTime: 800,
  })

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)
    void tokenApi.watchTrades(mint).catch(() => undefined)
    const unsub = wsService.onChartUpdate((series) => {
      if (series.mint !== mint) return
      queryClient.setQueryData(key, (prev) => ({
        ...(prev ?? { mint, intervalMs, candles: [], points: [], tradeCount: 0 }),
        ...series,
        intervalMs: series.intervalMs ?? intervalMs,
      }))
    })
    return () => {
      unsub()
    }
  }, [mint, intervalMs, queryClient])

  return query
}

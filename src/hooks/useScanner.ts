import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tokenApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import type { PumpToken } from '@/types'
import { ensureArray } from '@/lib/ensureArray'
import {
  passesAlphaFilter,
  passesTradeableFilter,
  isGraduatingSoon,
  resolveDisplayFeed,
  rankByLiveActivity,
  tradeQualityScore,
  type FeedDisplayMode,
} from '@/lib/feedQuality'
import type { ScannerLane } from '@/lib/feedQuality'
import { mergeQuantHolders } from '@/hooks/useQuantScanner'
import type { TokenChartSeries } from '@/lib/chartTypes'

function isPlaceholderImage(url?: string): boolean {
  if (!url?.trim()) return true
  const u = url.toLowerCase()
  return (
    u.includes('dexscreener.com/ds-data') ||
    u.includes('imagedelivery.net/wl1joijim_na') ||
    (u.includes('pump.fun/coin/') && u.endsWith('.png'))
  )
}

function preferImage(next?: string, prev?: string): string {
  if (next && !isPlaceholderImage(next)) return next
  if (prev && !isPlaceholderImage(prev)) return prev
  return next || prev || ''
}

function mergeScannerToken(prev: PumpToken, token: PumpToken): PumpToken {
  return {
    ...prev,
    ...token,
    image: preferImage(token.image, prev.image),
    metadataUri: token.metadataUri || prev.metadataUri,
    holders: token.holdersVerified
      ? (token.holders ?? prev.holders)
      : Math.max(prev.holders ?? 0, token.holders ?? 0),
    holdersVerified: prev.holdersVerified || token.holdersVerified,
    lastTradeAt: token.lastTradeAt ?? prev.lastTradeAt,
    trades1m: token.trades1m ?? prev.trades1m,
    volume5mSol: Math.max(prev.volume5mSol ?? 0, token.volume5mSol ?? 0),
    isActive: token.isActive ?? prev.isActive,
    buyPressure1m: token.buyPressure1m ?? prev.buyPressure1m,
    mcapChange5m: token.mcapChange5m ?? prev.mcapChange5m,
  }
}

function upsert(list: PumpToken[], token: PumpToken, max = 80): PumpToken[] {
  const idx = list.findIndex((t) => t.mint === token.mint)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = mergeScannerToken(next[idx], token)
    return next
  }
  return [token, ...list].slice(0, max)
}

type ScannerPayload = {
  tokens: PumpToken[]
  mode: FeedDisplayMode
  tradeableCount: number
}

/** Server already applied filterForLane — do not re-filter HTTP/feed:update snapshots. */
function payloadFromServer(tokens: PumpToken[] | unknown, lane: ScannerLane): ScannerPayload {
  const list = ensureArray<PumpToken>(tokens)
  const tradeableCount = list.filter(passesTradeableFilter).length
  if (lane === 'active') {
    return { tokens: list, mode: 'active', tradeableCount }
  }
  if (lane === 'tradeable' || lane === 'all') {
    const mode: FeedDisplayMode = tradeableCount > 0 ? 'tradeable' : 'watchlist_fallback'
    return { tokens: list, mode, tradeableCount }
  }
  return { tokens: list, mode: 'watchlist_fallback', tradeableCount }
}

/** Incremental WS events — merge then re-rank locally. */
function applyLane(tokens: PumpToken[], lane: ScannerLane): ScannerPayload {
  if (lane === 'graduating') {
    const list = tokens
      .filter(isGraduatingSoon)
      .sort((a, b) => b.bondingCurvePercent - a.bondingCurvePercent)
    return { tokens: list, mode: 'watchlist_fallback', tradeableCount: tokens.filter(passesTradeableFilter).length }
  }
  if (lane === 'active') {
    const list = rankByLiveActivity(tokens, 60)
    return {
      tokens: list,
      mode: list.length >= 3 ? 'active' : 'watchlist_fallback',
      tradeableCount: tokens.filter(passesTradeableFilter).length,
    }
  }
  if (lane === 'alpha') {
    const list = [...tokens]
      .filter(passesAlphaFilter)
      .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
      .slice(0, 60)
    return { tokens: list, mode: 'watchlist_fallback', tradeableCount: tokens.filter(passesTradeableFilter).length }
  }
  const resolved = resolveDisplayFeed(tokens, 80)
  return { tokens: resolved.tokens, mode: resolved.mode, tradeableCount: resolved.tradeableCount }
}

export function useScannerFeed(lane: ScannerLane = 'tradeable') {
  const queryClient = useQueryClient()
  const key = ['tokens', 'scanner', lane] as const

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const raw =
        lane === 'graduating'
          ? await tokenApi.graduating()
          : await tokenApi.feed(
              lane === 'alpha' ? 'alpha' : lane === 'active' ? 'active' : 'tradeable',
            )
      return payloadFromServer(ensureArray<PumpToken>(raw), lane)
    },
    refetchInterval: 20_000,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    wsService.connect()

    const pushToken = (token: PumpToken) => {
      queryClient.setQueryData<ScannerPayload>(key, (old) => {
        const list = old?.tokens ?? []
        const idx = list.findIndex((t) => t.mint === token.mint)
        const merged =
          idx >= 0 ? upsert(list, token, 120) : upsert(list, token, 120)
        return applyLane(merged, lane)
      })
    }

    const onTradeable = (token: PumpToken) => {
      if (passesTradeableFilter(token)) {
        queryClient.setQueryData<ScannerPayload>(['tokens', 'scanner', 'tradeable'], (old) => {
          const merged = upsert(old?.tokens ?? [], token)
          return applyLane(merged, 'tradeable')
        })
      }
      if (lane === 'active') {
        if (token.isActive || (token.trades1m ?? 0) > 0 || (token.volume5mSol ?? 0) > 0) {
          pushToken(token)
        }
      } else if (lane === 'tradeable' || lane === 'all') pushToken(token)
      else if (lane === 'alpha' && passesAlphaFilter(token)) pushToken(token)
    }

    const onGraduating = (token: PumpToken) => {
      if (!isGraduatingSoon(token) && token.bondingCurvePercent < 100) return
      queryClient.setQueryData<ScannerPayload>(['tokens', 'scanner', 'graduating'], (old) => {
        const merged = upsert(old?.tokens ?? [], {
          ...token,
          bondingCurvePercent: Math.max(token.bondingCurvePercent, 78),
        })
        return applyLane(merged, 'graduating')
      })
      if (lane === 'graduating') pushToken(token)
    }

    const onPatch = (token: PumpToken) => {
      const hasLive =
        token.isActive ||
        (token.trades1m ?? 0) > 0 ||
        (token.volume5mSol ?? 0) > 0 ||
        Boolean(token.lastTradeAt)
      queryClient.setQueryData<ScannerPayload>(key, (old) => {
        if (!old) return old
        const list = old.tokens ?? []
        const idx = list.findIndex((t) => t.mint === token.mint)
        if (idx >= 0) {
          const next = [...list]
          next[idx] = mergeScannerToken(next[idx], token)
          return { ...old, tokens: next }
        }
        if (lane === 'active' && hasLive) {
          return {
            ...old,
            tokens: upsert(list, token, 120),
            mode: 'active',
          }
        }
        if ((lane === 'tradeable' || lane === 'all') && hasLive) {
          return { ...old, tokens: upsert(list, token, 120) }
        }
        return old
      })
      if (isGraduatingSoon(token)) onGraduating(token)
    }

    const u1 = wsService.onFeedPrepend(onTradeable)
    const u2 = wsService.onPumpPortalToken((t) => {
      if (isGraduatingSoon(t)) onGraduating(t)
      else onTradeable(t)
    })
    const u3 = wsService.onFeedPatch(onPatch)
    const u3b = wsService.onTokenUpdate(onPatch)
    const u4 = wsService.onTokenGraduating(onGraduating)
    const u5 = wsService.onFeedUpdate((tokens) => {
      queryClient.setQueryData(key, payloadFromServer(ensureArray(tokens), lane))
    })

    return () => {
      u1()
      u2()
      u3()
      u3b()
      u4()
      u5()
    }
  }, [queryClient, lane])

  const merged: PumpToken[] | undefined = query.data?.tokens
    ? mergeQuantHolders(query.data.tokens)
    : undefined

  useEffect(() => {
    const applyHolderPatch = (u: { mint: string; holders?: number; holdersVerified?: boolean }) => {
      if (!u.holders || u.holders <= 0) return
      queryClient.setQueryData<ScannerPayload>(key, (prev) => {
        const list = ensureArray<PumpToken>(prev?.tokens ?? [])
        const idx = list.findIndex((t) => t.mint === u.mint)
        if (idx < 0) return prev
        const next = [...list]
        next[idx] = {
          ...next[idx],
          holders: u.holdersVerified
            ? (u.holders ?? next[idx].holders)
            : Math.max(next[idx].holders ?? 0, u.holders ?? 0),
          holdersVerified: u.holdersVerified ?? next[idx].holdersVerified,
        }
        if (!prev) return prev
        return { ...prev, tokens: next }
      })
    }
    const unsub = wsService.onQuantHolders(applyHolderPatch)
    const unsubLegacy = wsService.onQuantUpdate((u) => {
      if (u.scores) return
      if (u.holders) applyHolderPatch(u)
    })
    return () => {
      unsub()
      unsubLegacy()
    }
  }, [queryClient, lane])

  return {
    ...query,
    data: merged,
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
    refetchInterval: 3_000,
    staleTime: 1_000,
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

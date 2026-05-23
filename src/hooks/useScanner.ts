import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tokenApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import { pumpPortalWs } from '@/services/pumpportal-ws'
import { useBrowserPumpPortalWs } from '@/lib/pumpportalConfig'
import type { PumpToken } from '@/types'
import { ensureArray } from '@/lib/ensureArray'
import {
  passesAlphaFilter,
  passesActiveScannerFilter,
  passesTradeableFilter,
  isGraduatingSoon,
  resolveDisplayFeed,
  tradeQualityScore,
  type FeedDisplayMode,
} from '@/lib/feedQuality'
import type { ScannerLane } from '@/lib/feedQuality'
import { mergeQuantHolders } from '@/hooks/useQuantScanner'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import { isUsableTokenImageUrl } from '@trading'

function preferImage(next?: string, prev?: string): string {
  if (next && isUsableTokenImageUrl(next)) return next
  if (prev && isUsableTokenImageUrl(prev)) return prev
  return next || prev || ''
}

function mergeScannerToken(prev: PumpToken, token: PumpToken): PumpToken {
  const streamLive = Boolean(token.lastTradeAt && token.lastTradeAt >= Date.now() - 120_000)
  const holders = streamLive
    ? Math.max(1, token.holders ?? prev.holders ?? 0)
    : Math.max(prev.holders ?? 0, token.holders ?? 0)
  const verified =
    (prev.holdersVerified && holders >= 2) || (token.holdersVerified && holders >= 2)
  return {
    ...prev,
    ...token,
    image: preferImage(token.image, prev.image),
    metadataUri: token.metadataUri || prev.metadataUri,
    holders,
    holdersVerified: verified,
    lastTradeAt: token.lastTradeAt ?? prev.lastTradeAt,
    trades1m: token.trades1m ?? prev.trades1m,
    volume5mSol: Math.max(prev.volume5mSol ?? 0, token.volume5mSol ?? 0),
    isActive: token.isActive ?? prev.isActive,
    buyPressure1m: token.buyPressure1m ?? prev.buyPressure1m,
    mcapChange5m: token.mcapChange5m ?? prev.mcapChange5m,
  }
}

function applyTickToScannerToken(prev: PumpToken, tick: TradeTickPayload): PumpToken {
  return {
    ...prev,
    holders: tick.holders != null && tick.holders > 0 ? tick.holders : prev.holders,
    holdersVerified:
      tick.holdersVerified != null
        ? tick.holdersVerified && (tick.holders ?? prev.holders) >= 2
        : prev.holdersVerified,
    lastTradeAt: tick.timestampMs,
    marketCap: tick.marketCapUsd ?? prev.marketCap,
    bondingCurvePercent: tick.bondingCurvePercent ?? prev.bondingCurvePercent,
    isActive: true,
  }
}

function upsert(list: PumpToken[], token: PumpToken, max = 100): PumpToken[] {
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

/** Server already filtered — return as-is for live lanes. */
function payloadFromServer(tokens: PumpToken[] | unknown, lane: ScannerLane): ScannerPayload {
  const list = ensureArray<PumpToken>(tokens)
  const tradeableCount = list.filter(passesTradeableFilter).length
  if (lane === 'active' || lane === 'all') {
    return { tokens: list, mode: 'active', tradeableCount }
  }
  if (lane === 'tradeable') {
    return {
      tokens: list,
      mode: tradeableCount > 0 ? 'tradeable' : 'watchlist_fallback',
      tradeableCount,
    }
  }
  return { tokens: list, mode: 'watchlist_fallback', tradeableCount }
}

function applyLane(tokens: PumpToken[], lane: ScannerLane): ScannerPayload {
  if (lane === 'all' || lane === 'active') {
    return payloadFromServer(tokens, lane)
  }
  if (lane === 'graduating') {
    const list = tokens
      .filter(isGraduatingSoon)
      .sort((a, b) => b.bondingCurvePercent - a.bondingCurvePercent)
    return { tokens: list, mode: 'watchlist_fallback', tradeableCount: tokens.filter(passesTradeableFilter).length }
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

export function useScannerFeed(lane: ScannerLane = 'all') {
  const queryClient = useQueryClient()
  const key = ['tokens', 'scanner', lane] as const

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const raw =
        lane === 'graduating'
          ? await tokenApi.graduating()
          : await tokenApi.feed(lane)
      return payloadFromServer(raw, lane)
    },
    refetchInterval: 5_000,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
    retry: 2,
  })

  useEffect(() => {
    wsService.connect()

    const patchList = (token: PumpToken) => {
      queryClient.setQueryData<ScannerPayload>(key, (old) => {
        const list = old?.tokens ?? []
        return {
          ...(old ?? { mode: 'active' as FeedDisplayMode, tradeableCount: 0 }),
          tokens: upsert(list, token),
          mode: old?.mode ?? 'active',
          tradeableCount: old?.tradeableCount ?? 0,
        }
      })
    }

    const pushToken = (token: PumpToken) => {
      if (lane === 'all' || lane === 'active' || lane === 'tradeable') {
        patchList(token)
        return
      }
      queryClient.setQueryData<ScannerPayload>(key, (old) => {
        const list = old?.tokens ?? []
        return applyLane(upsert(list, token, 120), lane)
      })
    }

    const onStream = (token: PumpToken) => {
      if (passesTradeableFilter(token)) {
        queryClient.setQueryData<ScannerPayload>(['tokens', 'scanner', 'tradeable'], (old) => {
          const merged = upsert(old?.tokens ?? [], token)
          return applyLane(merged, 'tradeable')
        })
      }
      if (lane === 'active') {
        if (passesActiveScannerFilter(token)) pushToken(token)
      } else if (lane === 'all' || lane === 'alpha') {
        pushToken(token)
      } else if (lane === 'tradeable') {
        if (passesTradeableFilter(token)) pushToken(token)
      }
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
      queryClient.setQueryData<ScannerPayload>(key, (old) => {
        if (!old) return old
        const list = old.tokens ?? []
        const idx = list.findIndex((t) => t.mint === token.mint)
        if (idx >= 0) {
          const next = [...list]
          next[idx] = mergeScannerToken(next[idx], token)
          return { ...old, tokens: next }
        }
        const hasLive =
          token.isActive ||
          (token.trades1m ?? 0) > 0 ||
          (token.volume5mSol ?? 0) > 0 ||
          Boolean(token.lastTradeAt)
        if (hasLive && (lane === 'all' || lane === 'active' || lane === 'tradeable')) {
          return { ...old, tokens: upsert(list, token, 120) }
        }
        return old
      })
      if (isGraduatingSoon(token)) onGraduating(token)
    }

    const u1 = wsService.onFeedPrepend(onStream)
    const u2 = wsService.onPumpPortalToken((t) => {
      if (isGraduatingSoon(t)) onGraduating(t)
      else onStream(t)
    })
    const u3 = wsService.onFeedPatch(onPatch)
    const u3b = wsService.onTokenUpdate(onPatch)
    const u4 = wsService.onTokenGraduating(onGraduating)
    const u5 = wsService.onFeedUpdate((tokens) => {
      const list = ensureArray<PumpToken>(tokens)
      if (list.length === 0) return
      queryClient.setQueryData(key, payloadFromServer(list, lane))
    })
    const u6 = wsService.onFeedGraduating((tokens) => {
      if (lane !== 'graduating') return
      const list = ensureArray<PumpToken>(tokens)
      if (list.length === 0) return
      queryClient.setQueryData(key, payloadFromServer(list, 'graduating'))
    })

    return () => {
      u1()
      u2()
      u3()
      u3b()
      u4()
      u5()
      u6()
    }
  }, [queryClient, lane])

  useEffect(() => {
    const applyHolderPatch = (u: {
      mint: string
      holders?: number
      holdersVerified?: boolean
    }) => {
      if (!u.holders || u.holders <= 0) return
      queryClient.setQueryData<ScannerPayload>(key, (prev) => {
        const list = ensureArray<PumpToken>(prev?.tokens ?? [])
        const idx = list.findIndex((t) => t.mint === u.mint)
        if (idx < 0) return prev
        const next = [...list]
        const h = Math.max(next[idx].holders ?? 0, u.holders ?? 0)
        next[idx] = {
          ...next[idx],
          holders: h,
          holdersVerified: Boolean(u.holdersVerified) && h >= 2,
        }
        if (!prev) return prev
        return { ...prev, tokens: next }
      })
    }
    const unsubTick = wsService.onTradeTick((tick) => {
      if (!tick.mint) return
      queryClient.setQueryData<ScannerPayload>(key, (prev) => {
        const list = ensureArray<PumpToken>(prev?.tokens ?? [])
        const idx = list.findIndex((t) => t.mint === tick.mint)
        if (idx < 0 || !prev) return prev
        const next = [...list]
        next[idx] = applyTickToScannerToken(next[idx], tick)
        return { ...prev, tokens: next }
      })
    })
    const unsub = wsService.onQuantHolders(applyHolderPatch)
    const unsubLegacy = wsService.onQuantUpdate((u) => {
      if (u.scores) return
      if (u.holders) applyHolderPatch(u)
    })
    return () => {
      unsub()
      unsubLegacy()
      unsubTick()
    }
  }, [queryClient, lane])

  const merged: PumpToken[] | undefined = query.data?.tokens
    ? mergeQuantHolders(query.data.tokens)
    : undefined

  return {
    ...query,
    data: merged,
    displayMode: query.data?.mode ?? 'watchlist_fallback',
    tradeableCount: query.data?.tradeableCount ?? 0,
  }
}

export function useTokenChart(mint: string, intervalMs = 5_000) {
  const queryClient = useQueryClient()
  const browserPumpPortal = useBrowserPumpPortalWs()
  const key = ['tokens', mint, 'chart', intervalMs] as const

  const query = useQuery<TokenChartSeries>({
    queryKey: key,
    queryFn: () => tokenApi.chart(mint, intervalMs),
    enabled: !!mint,
    refetchInterval: 8_000,
    staleTime: 500,
  })

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)
    void tokenApi.watchTrades(mint).catch(() => undefined)
    if (browserPumpPortal) pumpPortalWs.watchTrades(mint)
    const unsubTick = wsService.onTradeTick((tick) => {
      if (tick.mint !== mint) return
      queryClient.invalidateQueries({ queryKey: ['tokens', mint, 'chart'] })
    })
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
      unsubTick()
    }
  }, [mint, intervalMs, queryClient, browserPumpPortal])

  return query
}

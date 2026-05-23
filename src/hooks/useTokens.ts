import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tokenApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import { pumpPortalWs } from '@/services/pumpportal-ws'
import { useDirectPumpPortalWs } from '@/lib/pumpportalConfig'
import type { PumpToken } from '@/types'
import type { FeedTrade } from '@/services/api'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import { ensureArray } from '@/lib/ensureArray'
function applyTradeTickToToken(token: PumpToken, tick: TradeTickPayload): PumpToken {
  const holders =
    tick.holders != null && tick.holders > 0
      ? tick.holders
      : token.holders
  return {
    ...token,
    holders,
    holdersVerified:
      tick.holdersVerified != null
        ? tick.holdersVerified && holders >= 2
        : token.holdersVerified,
    lastTradeAt: tick.timestampMs,
    marketCap: tick.marketCapUsd ?? token.marketCap,
    bondingCurvePercent: tick.bondingCurvePercent ?? token.bondingCurvePercent,
    isActive: true,
  }
}

function mergeTokenIntoFeed(feed: PumpToken[] | unknown, token: PumpToken): PumpToken[] {
  const list = ensureArray<PumpToken>(feed)
  const idx = list.findIndex((t) => t.mint === token.mint)
  if (idx >= 0) {
    const next = [...list]
    const prev = next[idx]
    next[idx] = {
      ...prev,
      ...token,
      holders: Math.max(prev.holders ?? 0, token.holders ?? 0),
      image: token.image || prev.image,
      metadataUri: token.metadataUri || prev.metadataUri,
      lastTradeAt: token.lastTradeAt ?? prev.lastTradeAt,
    }
    return next
  }
  return [token, ...list].slice(0, 120)
}

function prependToken(feed: PumpToken[] | unknown, token: PumpToken): PumpToken[] {
  const list = ensureArray<PumpToken>(feed)
  if (list.some((t) => t.mint === token.mint)) {
    return mergeTokenIntoFeed(list, token)
  }
  return [token, ...list].slice(0, 120)
}

export function useTokenFeed() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['tokens', 'feed'],
    queryFn: () => tokenApi.feed('alpha'),
    refetchInterval: 60_000,
    staleTime: 15_000,
    retry: 2,
  })

  const directPumpPortal = useDirectPumpPortalWs()

  useEffect(() => {
    wsService.connect()

    const patchFeed = (token: PumpToken) => {
      queryClient.setQueryData<PumpToken[]>(['tokens', 'feed'], (old) =>
        mergeTokenIntoFeed(old ?? [], token),
      )
      queryClient.setQueryData(['tokens', token.mint], (prev) =>
        prev ? { ...(prev as PumpToken), ...token } : token,
      )
    }

    const prepend = (token: PumpToken) => {
      queryClient.setQueryData<PumpToken[]>(['tokens', 'feed'], (old) =>
        prependToken(old ?? [], token),
      )
    }

    const unsubFeed = wsService.onFeedUpdate((tokens) => {
      queryClient.setQueryData(['tokens', 'feed'], ensureArray<PumpToken>(tokens))
    })
    const unsubPrepend = wsService.onFeedPrepend(prepend)
    const unsubPatch = wsService.onFeedPatch(patchFeed)
    const unsubPortal = wsService.onPumpPortalToken(prepend)
    const unsubToken = wsService.onTokenUpdate(patchFeed)
    const unsubDirect = directPumpPortal ? pumpPortalWs.onToken(prepend) : () => {}
    const unsubDirectPatch = directPumpPortal ? pumpPortalWs.onTokenUpdate(patchFeed) : () => {}
    const unsubTradeTick = wsService.onTradeTick((tick) => {
      queryClient.setQueryData<PumpToken[]>(['tokens', 'feed'], (old) => {
        const list = ensureArray<PumpToken>(old)
        const idx = list.findIndex((t) => t.mint === tick.mint)
        if (idx < 0) return list
        const next = [...list]
        next[idx] = applyTradeTickToToken(next[idx], tick)
        return next
      })
    })

    return () => {
      unsubFeed()
      unsubPrepend()
      unsubPatch()
      unsubPortal()
      unsubToken()
      unsubDirect()
      unsubDirectPatch()
      unsubTradeTick()
    }
  }, [queryClient, directPumpPortal])

  return query
}

export function useFeedStats() {
  return useQuery({
    queryKey: ['tokens', 'stats'],
    queryFn: () => tokenApi.stats(),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

export function useToken(mint: string) {
  const queryClient = useQueryClient()
  const directPumpPortal = useDirectPumpPortalWs()

  const query = useQuery({
    queryKey: ['tokens', mint],
    queryFn: () => tokenApi.get(mint),
    enabled: !!mint,
    retry: 1,
    refetchInterval: 4_000,
    staleTime: 2_000,
  })

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)

    const patch = (token: PumpToken) => {
      if (token.mint !== mint) return
      queryClient.setQueryData<PumpToken>(['tokens', mint], (prev) =>
        prev
          ? {
              ...prev,
              ...token,
              image: token.image || prev.image,
              metadataUri: token.metadataUri || prev.metadataUri,
            }
          : token,
      )
    }

    const unsubHolders = wsService.onQuantHolders((u) => {
      if (u.mint !== mint || !u.holders) return
      queryClient.setQueryData<PumpToken>(['tokens', mint], (prev) => {
        if (!prev) return prev
        const h = Math.max(prev.holders, u.holders ?? 0)
        return {
          ...prev,
          holders: h,
          holdersVerified: Boolean(u.holdersVerified) && h >= 2,
        }
      })
    })

    const unsubTick = wsService.onTradeTick((tick) => {
      if (tick.mint !== mint) return
      queryClient.setQueryData<PumpToken>(['tokens', mint], (prev) =>
        prev ? applyTradeTickToToken(prev, tick) : prev,
      )
      queryClient.setQueryData<FeedTrade[]>(['tokens', mint, 'trades'], (prev) => {
        const row: FeedTrade = {
          signature: tick.signature,
          wallet: tick.wallet,
          side: tick.side,
          solAmount: tick.solAmount,
          tokenAmount: tick.tokenAmount,
          timestampMs: tick.timestampMs,
          timestamp: new Date(tick.timestampMs).toISOString(),
        }
        const list = ensureArray<FeedTrade>(prev)
        if (list.some((t) => t.signature === row.signature)) return list
        return [row, ...list].slice(0, 80)
      })
    })

    const unsub = wsService.onTokenUpdate(patch)
    const unsubDirect = directPumpPortal ? pumpPortalWs.onTokenUpdate(patch) : () => {}
    return () => {
      unsub()
      unsubDirect()
      unsubHolders()
      unsubTick()
    }
  }, [mint, queryClient, directPumpPortal])

  return query
}

export function useTokenTrades(mint: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['tokens', mint, 'trades'],
    queryFn: () => tokenApi.trades(mint),
    enabled: !!mint,
    refetchInterval: 15_000,
    staleTime: 2_000,
  })

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)
    const unsub = wsService.onTradeTick((tick) => {
      if (tick.mint !== mint) return
      queryClient.setQueryData<FeedTrade[]>(['tokens', mint, 'trades'], (prev) => {
        const row: FeedTrade = {
          signature: tick.signature,
          wallet: tick.wallet,
          side: tick.side,
          solAmount: tick.solAmount,
          tokenAmount: tick.tokenAmount,
          timestampMs: tick.timestampMs,
          timestamp: new Date(tick.timestampMs).toISOString(),
        }
        const list = ensureArray<FeedTrade>(prev)
        if (list.some((t) => t.signature === row.signature)) return list
        return [row, ...list].slice(0, 80)
      })
    })
    return () => {
      unsub()
    }
  }, [mint, queryClient])

  return query
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

export { useScannerFeed, useTokenChart } from './useScanner'

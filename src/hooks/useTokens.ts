import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tokenApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import { pumpPortalWs } from '@/services/pumpportal-ws'
import { useDirectPumpPortalWs } from '@/lib/pumpportalConfig'
import type { PumpToken } from '@/types'
import { ensureArray } from '@/lib/ensureArray'

function mergeTokenIntoFeed(feed: PumpToken[] | unknown, token: PumpToken): PumpToken[] {
  const list = ensureArray<PumpToken>(feed)
  const idx = list.findIndex((t) => t.mint === token.mint)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = { ...next[idx], ...token }
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
    queryFn: () => tokenApi.feed(),
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

    return () => {
      unsubFeed()
      unsubPrepend()
      unsubPatch()
      unsubPortal()
      unsubToken()
      unsubDirect()
      unsubDirectPatch()
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
  })

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)

    const patch = (token: PumpToken) => {
      if (token.mint !== mint) return
      queryClient.setQueryData(['tokens', mint], token)
    }

    const unsub = wsService.onTokenUpdate(patch)
    const unsubDirect = directPumpPortal ? pumpPortalWs.onTokenUpdate(patch) : () => {}
    return () => {
      unsub()
      unsubDirect()
    }
  }, [mint, queryClient, directPumpPortal])

  return query
}

export function useTokenTrades(mint: string) {
  return useQuery({
    queryKey: ['tokens', mint, 'trades'],
    queryFn: () => tokenApi.trades(mint),
    enabled: !!mint,
    refetchInterval: 8_000,
    staleTime: 3_000,
  })
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
    default:
      return copy
  }
}

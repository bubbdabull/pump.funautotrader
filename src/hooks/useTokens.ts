import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tokenApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import { pumpPortalWs } from '@/services/pumpportal-ws'
import { useDirectPumpPortalWs } from '@/lib/pumpportalConfig'
import type { PumpToken } from '@/types'
import { ensureArray } from '@/lib/ensureArray'
import { mergePumpTokens, normalizePumpToken, normalizePumpTokens } from '@/lib/normalizeToken'

function mergeTokenIntoFeed(feed: PumpToken[] | unknown, token: PumpToken): PumpToken[] {
  const list = normalizePumpTokens(ensureArray<PumpToken>(feed))
  const t = normalizePumpToken(token)
  const idx = list.findIndex((x) => x.mint === t.mint)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = mergePumpTokens(next[idx], t)
    return next
  }
  return [t, ...list].slice(0, 120)
}

function prependToken(feed: PumpToken[] | unknown, token: PumpToken): PumpToken[] {
  const list = normalizePumpTokens(ensureArray<PumpToken>(feed))
  const t = normalizePumpToken(token)
  if (list.some((x) => x.mint === t.mint)) {
    return mergeTokenIntoFeed(list, t)
  }
  return [t, ...list].slice(0, 120)
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
      queryClient.setQueryData(['tokens', 'feed'], normalizePumpTokens(tokens))
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
    refetchInterval: 4_000,
    staleTime: 2_000,
  })

  useEffect(() => {
    if (!mint) return
    wsService.connect()
    wsService.subscribeToken(mint)

    const patch = (raw: PumpToken) => {
      if (raw.mint !== mint) return
      queryClient.setQueryData<PumpToken>(['tokens', mint], (prev) =>
        prev ? mergePumpTokens(prev, normalizePumpToken(raw)) : normalizePumpToken(raw),
      )
    }

    const unsubHolders = wsService.onQuantHolders((u) => {
      if (u.mint !== mint || !u.holders) return
      queryClient.setQueryData<PumpToken>(['tokens', mint], (prev) => {
        if (!prev) return prev
        return mergePumpTokens(prev, {
          ...prev,
          holders: u.holdersVerified
            ? Math.max(prev.holders, u.holders ?? 0)
            : Math.max(prev.holders, u.holders ?? 0),
          holdersVerified: Boolean(u.holdersVerified) && (u.holders ?? 0) >= 2,
        })
      })
    })

    const unsub = wsService.onTokenUpdate(patch)
    const unsubDirect = directPumpPortal ? pumpPortalWs.onTokenUpdate(patch) : () => {}
    return () => {
      unsub()
      unsubDirect()
      unsubHolders()
    }
  }, [mint, queryClient, directPumpPortal])

  return query
}

export function useTokenTrades(mint: string) {
  return useQuery({
    queryKey: ['tokens', mint, 'trades'],
    queryFn: () => tokenApi.trades(mint),
    enabled: !!mint,
    refetchInterval: 4_000,
    staleTime: 1_500,
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
    case 'curve':
      return copy.sort((a, b) => b.bondingCurvePercent - a.bondingCurvePercent)
    default:
      return copy
  }
}

export { useScannerFeed, useTokenChart } from './useScanner'

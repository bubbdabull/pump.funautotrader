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
  tradeQualityScore,
  type FeedDisplayMode,
} from '@/lib/feedQuality'
import type { ScannerLane } from '@/lib/feedQuality'
import { mergeQuantHolders } from '@/hooks/useQuantScanner'

function upsert(list: PumpToken[], token: PumpToken, max = 80): PumpToken[] {
  const idx = list.findIndex((t) => t.mint === token.mint)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = { ...next[idx], ...token }
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
          : await tokenApi.feed(lane === 'alpha' ? 'alpha' : 'tradeable')
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
        const merged = upsert(old?.tokens ?? [], token, 120)
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
      if (lane === 'tradeable' || lane === 'all') pushToken(token)
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
      if (isGraduatingSoon(token)) onGraduating(token)
      else onTradeable(token)
    }

    const u1 = wsService.onFeedPrepend(onTradeable)
    const u2 = wsService.onPumpPortalToken((t) => {
      if (isGraduatingSoon(t)) onGraduating(t)
      else onTradeable(t)
    })
    const u3 = wsService.onFeedPatch(onPatch)
    const u4 = wsService.onTokenGraduating(onGraduating)
    const u5 = wsService.onFeedUpdate((tokens) => {
      queryClient.setQueryData(key, payloadFromServer(ensureArray(tokens), lane))
    })

    return () => {
      u1()
      u2()
      u3()
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
          holders: Math.max(next[idx].holders, u.holders ?? 0),
          holdersVerified: u.holdersVerified ?? next[idx].holdersVerified,
        }
        return applyLane(next, lane)
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

export function useTokenChart(mint: string) {
  return useQuery({
    queryKey: ['tokens', mint, 'chart'],
    queryFn: () => tokenApi.chart(mint),
    enabled: !!mint,
    refetchInterval: 12_000,
    staleTime: 5_000,
  })
}

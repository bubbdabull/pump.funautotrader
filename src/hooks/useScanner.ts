import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tokenApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import type { PumpToken } from '@/types'
import { ensureArray } from '@/lib/ensureArray'
import { passesAlphaFilter, isGraduatingSoon } from '@/lib/feedQuality'
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

function applyLane(tokens: PumpToken[], lane: ScannerLane): PumpToken[] {
  if (lane === 'graduating') return tokens.filter(isGraduatingSoon)
  if (lane === 'alpha') return tokens.filter(passesAlphaFilter)
  return tokens
}

export function useScannerFeed(lane: ScannerLane = 'alpha') {
  const queryClient = useQueryClient()
  const key = ['tokens', 'scanner', lane] as const

  const query = useQuery({
    queryKey: key,
    queryFn: () => (lane === 'graduating' ? tokenApi.graduating() : tokenApi.feed(lane)),
    refetchInterval: 45_000,
    staleTime: 12_000,
  })

  useEffect(() => {
    wsService.connect()

    const onAlpha = (token: PumpToken) => {
      if (!passesAlphaFilter(token)) return
      queryClient.setQueryData<PumpToken[]>(key, (old) => upsert(ensureArray(old), token))
    }

    const onGraduating = (token: PumpToken) => {
      if (!isGraduatingSoon(token) && token.bondingCurvePercent < 100) return
      queryClient.setQueryData<PumpToken[]>(['tokens', 'scanner', 'graduating'], (old) =>
        upsert(ensureArray(old), { ...token, bondingCurvePercent: Math.max(token.bondingCurvePercent, 78) }),
      )
      queryClient.setQueryData<PumpToken[]>(['tokens', 'scanner', 'alpha'], (old): PumpToken[] =>
        ensureArray<PumpToken>(old).filter((t) => t.mint !== token.mint),
      )
    }

    const onPatch = (token: PumpToken) => {
      if (isGraduatingSoon(token)) onGraduating(token)
      else if (passesAlphaFilter(token)) onAlpha(token)
    }

    const u1 = wsService.onFeedPrepend(onAlpha)
    const u2 = wsService.onPumpPortalToken((t) => {
      if (isGraduatingSoon(t)) onGraduating(t)
      else onAlpha(t)
    })
    const u3 = wsService.onFeedPatch(onPatch)
    const u4 = wsService.onTokenGraduating(onGraduating)
    const u5 = wsService.onFeedUpdate((tokens) => {
      queryClient.setQueryData(key, applyLane(ensureArray(tokens), lane))
    })

    return () => {
      u1()
      u2()
      u3()
      u4()
      u5()
    }
  }, [queryClient, lane])

  const merged: PumpToken[] | undefined = query.data
    ? mergeQuantHolders(ensureArray<PumpToken>(query.data))
    : undefined

  useEffect(() => {
    const unsub = wsService.onQuantUpdate((u) => {
      queryClient.setQueryData<PumpToken[]>(key, (prev) => {
        const list = mergeQuantHolders(ensureArray<PumpToken>(prev))
        const idx = list.findIndex((t) => t.mint === u.mint)
        if (idx < 0) return list
        const next = [...list]
        next[idx] = {
          ...next[idx],
          holders: Math.max(next[idx].holders, u.holders ?? 0),
        }
        return next
      })
    })
    return () => {
      unsub()
    }
  }, [queryClient, lane])

  return { ...query, data: merged }
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

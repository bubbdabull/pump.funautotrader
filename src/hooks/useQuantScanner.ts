import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { quantApi } from '@/services/api'
import { wsService } from '@/services/websocket'
import { useQuantStore } from '@/stores/quantStore'
import type { QuantRanking, QuantUpdate } from '@/lib/quantTypes'

export function useQuantRankings() {
  return useQuery({
    queryKey: ['quant', 'rankings'],
    queryFn: () => quantApi.rankings(),
    refetchInterval: 15_000,
  })
}

/** Live quant updates over Socket.IO + REST analyze fallback. */
export function useQuantLive(mint?: string) {
  const [live, setLive] = useState<QuantUpdate | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const analyze = useQuery({
    queryKey: ['quant', 'analyze', mint],
    queryFn: () => (mint ? quantApi.analyze(mint) : null),
    enabled: Boolean(mint),
    refetchInterval: 10_000,
  })

  const patch = useQuantStore((s) => s.patch)

  useEffect(() => {
    wsService.connect()
    const unsub = wsService.onQuantUpdate((payload) => {
      patch(payload)
      if (!mint || payload.mint === mint) setLive(payload)
    })
    const unsubRug = wsService.onRugWarning(({ mint: m, rug }) => {
      if (!mint || m === mint) setWarnings(rug.reasons)
    })
    return () => {
      unsub()
      unsubRug()
    }
  }, [mint, patch])

  return {
    live,
    analyze: analyze.data,
    rugWarnings: warnings,
    isLoading: analyze.isLoading,
  }
}

export function useMomentumRankingsState() {
  const [rankings, setRankings] = useState<QuantRanking[]>([])
  const query = useQuantRankings()
  const patch = useQuantStore((s) => s.patch)
  const addStrategy = useQuantStore((s) => s.addStrategy)

  useEffect(() => {
    if (query.data) setRankings(query.data)
  }, [query.data])

  useEffect(() => {
    wsService.connect()
    const unsub = wsService.onQuantUpdate((u) => {
      if (!u.scores) return
      patch(u)
      const confidence = u.scores.tradeConfidenceScore
      if (confidence == null || !Number.isFinite(confidence)) return
      setRankings((prev) => {
        const next = [...prev.filter((r) => r.mint !== u.mint)]
        next.push({ mint: u.mint, confidence })
        return next.sort((a, b) => b.confidence - a.confidence).slice(0, 50)
      })
    })
    const unsubHolders = wsService.onQuantHolders((h) => {
      useQuantStore.getState().patchHolders(h)
    })
    const unsubStrat = wsService.onQuantStrategy(({ mint, signal }) => addStrategy(mint, signal))
    return () => {
      unsub()
      unsubHolders()
      unsubStrat()
    }
  }, [patch, addStrategy])

  return { rankings, ...query }
}

/** Merge live holder counts from quant stream into token list. */
export function mergeQuantHolders<T extends { mint: string; holders: number; holdersVerified?: boolean }>(
  tokens: T[] | undefined,
): T[] {
  if (!tokens?.length) return []
  const byMint = useQuantStore.getState().byMint
  return tokens.map((t) => {
    const q = byMint[t.mint]
    if (q?.holders == null) return t
    if (q.holdersVerified) {
      return { ...t, holders: q.holders, holdersVerified: true }
    }
    if (t.holdersVerified) {
      return { ...t, holders: Math.max(t.holders, q.holders) }
    }
    return q.holders > t.holders ? { ...t, holders: q.holders } : t
  })
}

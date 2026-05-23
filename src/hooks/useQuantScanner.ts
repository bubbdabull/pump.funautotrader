import { useEffect, useState } from 'react'
import { useQuantStore } from '@/stores/quantStore'
import { useRegistryRankings } from '@/hooks/useRegistry'
import { useTokenSubscription } from '@/hooks/useTokenSubscription'
import { realtimeGateway } from '@/services/realtime-gateway'
import type { QuantRanking, QuantUpdate } from '@/lib/quantTypes'

export function useQuantRankings() {
  const rankings = useRegistryRankings(100)
  return {
    data: rankings,
    isLoading: rankings.length === 0,
    isFetching: false,
    isError: false,
  }
}

/** Live quant updates over Socket.IO (signal:update → quant store). */
export function useQuantLive(mint?: string) {
  useTokenSubscription(mint)
  const live = useQuantStore((s) => (mint ? s.byMint[mint] : undefined))
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    const unsub = realtimeGateway.onSignalUpdate((payload) => {
      if (!mint || payload.mint === mint) {
        if (payload.rug.blocked) setWarnings(payload.riskPenalties)
      }
    })
    return () => {
      unsub()
    }
  }, [mint])

  return {
    live: live ?? null,
    analyze: live,
    rugWarnings: warnings,
    isLoading: Boolean(mint) && !live,
  }
}

export function useMomentumRankingsState() {
  const wsRankings = useRegistryRankings(50)
  const [rankings, setRankings] = useState<QuantRanking[]>([])
  const patch = useQuantStore((s) => s.patch)

  useEffect(() => {
    if (wsRankings.length > 0) setRankings(wsRankings)
  }, [wsRankings])

  useEffect(() => {
    const unsub = realtimeGateway.onSignalUpdate((s) => {
      const update: QuantUpdate = {
        mint: s.mint,
        scores: {
          momentumScore: s.momentumScore,
          liquidityScore: 0,
          buyPressureScore: 0,
          volatilityScore: 0,
          holderQualityScore: 0,
          whaleConfidenceScore: 0,
          rugProbabilityScore: s.rug.rugScore,
          tradeConfidenceScore: s.tradeConfidenceScore,
          vwap: 0,
          ema: 0,
          volumeDelta: 0,
          orderFlowImbalance: 0,
          priceVelocity: 0,
          liquidityGrowth: 0,
          tradeVelocity: 0,
          sharpeLike: 0,
        },
        rug: {
          rugScore: s.rug.rugScore,
          blocked: s.rug.blocked,
          fakeVolumeProbability: s.rug.fakeVolumeProbability ?? 0,
          creatorRisk: 0,
          holderConcentration: 0,
          liquidityWeakness: 0,
          suspiciousWallets: 0,
          reasons: s.riskPenalties,
        },
        strategies: [],
        risk: { allowed: !s.rug.blocked },
        at: s.at,
      }
      patch(update)
      setRankings((prev) => {
        const next = [...prev.filter((r) => r.mint !== s.mint)]
        next.push({ mint: s.mint, confidence: s.tradeConfidenceScore })
        return next.sort((a, b) => b.confidence - a.confidence).slice(0, 50)
      })
    })
    return () => {
      unsub()
    }
  }, [patch])

  return {
    rankings,
    isLoading: rankings.length === 0,
    isFetching: false,
    isError: false,
  }
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

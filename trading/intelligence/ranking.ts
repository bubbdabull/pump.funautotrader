import type { ScannerLane } from '../utils/feedQuality'
import { isGraduatingSoon, pickNearGraduation } from '../utils/feedQuality'
import { liveActivityScore } from '../utils/liveActivity'
import type { SignalState } from './types'

export type RankableToken = {
  mint: string
  symbol?: string
  marketCap?: number
  bondingCurvePercent: number
  holders?: number
  volume24h?: number
  signalState?: SignalState
  score?: number
  pumpProbabilityScore?: number
  smartMoneyScore?: number
  isActive?: boolean
  lastTradeAt?: number
  trades1m?: number
  volume5mSol?: number
  buyPressure1m?: number
  momentumScore?: number
}

export function isInvalidSignal(token: RankableToken): boolean {
  return token.signalState === 'INVALID_SIGNAL'
}

function intelligenceRank(a: RankableToken, b: RankableToken, now: number): number {
  const scoreA = (a.score ?? 0) + (a.pumpProbabilityScore ?? 0) * 0.15 + (a.smartMoneyScore ?? 0) * 0.08
  const scoreB = (b.score ?? 0) + (b.pumpProbabilityScore ?? 0) * 0.15 + (b.smartMoneyScore ?? 0) * 0.08
  if (scoreB !== scoreA) return scoreB - scoreA
  return liveActivityScore(b as Parameters<typeof liveActivityScore>[0], now) -
    liveActivityScore(a as Parameters<typeof liveActivityScore>[0], now)
}

/** Rank visible tokens — only INVALID_SIGNAL excluded. */
export function rankIntelligenceLane<T extends RankableToken>(
  tokens: T[],
  lane: ScannerLane,
  limit = 120,
  now = Date.now(),
): T[] {
  const visible = tokens.filter((t) => !isInvalidSignal(t))

  switch (lane) {
    case 'graduating': {
      const strict = visible.filter((t) => isGraduatingSoon(t as Parameters<typeof isGraduatingSoon>[0])).sort(
        (a, b) => (b.bondingCurvePercent ?? 0) - (a.bondingCurvePercent ?? 0),
      )
      if (strict.length >= 3) return strict.slice(0, limit)
      return pickNearGraduation(visible as Parameters<typeof pickNearGraduation>[0], limit) as T[]
    }
    case 'active':
      return [...visible]
        .filter((t) => t.isActive || (t.trades1m ?? 0) > 0 || (t.volume5mSol ?? 0) > 0.01)
        .sort((a, b) => intelligenceRank(a, b, now))
        .slice(0, limit)
    case 'alpha':
      return [...visible]
        .sort((a, b) => intelligenceRank(a, b, now))
        .slice(0, limit)
    case 'tradeable':
      return [...visible]
        .filter((t) => (t.score ?? 0) >= 45)
        .sort((a, b) => intelligenceRank(a, b, now))
        .slice(0, limit)
    case 'all':
    default:
      return [...visible].sort((a, b) => intelligenceRank(a, b, now)).slice(0, limit)
  }
}

export function countHighConfidence(tokens: RankableToken[], minScore = 58): number {
  return tokens.filter((t) => (t.score ?? 0) >= minScore && !isInvalidSignal(t)).length
}

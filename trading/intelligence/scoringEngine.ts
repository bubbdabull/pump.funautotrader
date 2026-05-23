import type { IntelligenceInput } from './types'
import { clamp01 } from '../utils/math'
import { activitySol, effectiveHolderCount, passesIngestGate } from '../utils/feedQuality'
import { hasRealTimeTradeActivity } from '../utils/liveActivity'

export interface ScoringResult {
  score: number
  confidenceScore: number
  dataCompletenessScore: number
}

function launchedAtMs(input: IntelligenceInput): number {
  if (!input.launchedAt) return 0
  if (typeof input.launchedAt === 'number') return input.launchedAt
  const t = Date.parse(input.launchedAt)
  return Number.isFinite(t) ? t : 0
}

/** Data completeness — missing fields reduce weight, never zero the score. */
export function computeDataCompleteness(input: IntelligenceInput): number {
  let w = 0
  let got = 0
  const mark = (present: boolean, weight: number) => {
    w += weight
    if (present) got += weight
  }
  mark(Boolean(input.symbol?.trim() && input.symbol !== 'UNKNOWN'), 0.12)
  mark(input.marketCap > 0, 0.14)
  mark((input.holders ?? 0) > 0 || (input.trades1m ?? 0) > 0, 0.12)
  mark(input.holdersVerified === true, 0.1)
  mark((input.volume24h ?? 0) > 0 || (input.volume5mSol ?? 0) > 0, 0.14)
  mark(input.lastTradeAt != null && input.lastTradeAt > 0, 0.16)
  mark(input.buyPressure1m != null, 0.1)
  mark(input.analytics != null, 0.12)
  return w > 0 ? clamp01(got / w) : 0.35
}

export function computeUnifiedScore(
  input: IntelligenceInput,
  now = Date.now(),
): ScoringResult {
  const completeness = computeDataCompleteness(input)
  const live = hasRealTimeTradeActivity(input, now) || input.isActive
  const a = input.analytics

  let score = 12 + completeness * 10

  const trades1m = input.trades1m ?? a?.windows.w60.tradeCount ?? 0
  const vol5 = input.volume5mSol ?? a?.windows.w30.volumeSol ?? 0
  const buyPressure =
    input.buyPressure1m != null
      ? input.buyPressure1m / 100
      : (a?.buyPressure1m ?? 0.5)

  score += Math.min(18, trades1m * 2.2)
  score += Math.min(14, Math.log10(vol5 + 0.02) * 9)
  score += Math.min(12, Math.abs(buyPressure - 0.5) * 24 * (buyPressure >= 0.5 ? 1 : 0.85))

  if (a) {
    score += Math.min(14, a.decayedMomentumScore * 14)
    score += Math.min(10, a.tradeConfidenceScore * 10)
    score += Math.min(8, a.burst.ignitionScore * 8)
    score += Math.min(6, a.velocity.volumeVelocity * 0.4)
    score += Math.min(5, a.migration.probability * 5)
  } else {
    const mom = (input.momentumScore ?? 0) / 100
    const sig = (input.signalScore ?? input.aiRiskScore ?? 50) / 100
    score += Math.min(10, mom * 10)
    score += Math.min(6, Math.max(0, (0.65 - sig) * 12))
  }

  const holders = effectiveHolderCount(input)
  score += Math.min(8, Math.log10(holders + 1) * 4)
  if (input.holdersVerified) score += 4

  const launched = launchedAtMs(input)
  if (launched > 0) {
    const ageMin = (now - launched) / 60_000
    if (ageMin < 30 && live) score += Math.min(8, (30 - ageMin) * 0.25)
    if (ageMin > 360 && !live) score -= Math.min(8, (ageMin - 360) * 0.01)
  }

  if (live) score += 6
  if ((input.mcapChange5m ?? 0) > 5) score += Math.min(6, (input.mcapChange5m ?? 0) * 0.15)

  const risk = input.signalScore ?? input.aiRiskScore ?? 50
  if (risk > 75) score -= Math.min(12, (risk - 75) * 0.4)

  score = Math.max(8, Math.min(100, Math.round(score)))

  let confidence = 0.35 + completeness * 0.45
  if (live) confidence += 0.12
  if (input.holdersVerified) confidence += 0.08
  if (a) confidence += 0.1

  return {
    score,
    confidenceScore: clamp01(confidence),
    dataCompletenessScore: completeness,
  }
}

export function isInvalidToken(input: IntelligenceInput, now = Date.now()): boolean {
  if (!input.mint || input.mint.length < 32) return true
  const sym = input.symbol?.trim().toUpperCase()
  if (sym === 'SCAM' || sym === 'TEST') return true
  if (!passesIngestGate(input as Parameters<typeof passesIngestGate>[0])) {
    const live = hasRealTimeTradeActivity(input, now)
    if (!live && activitySol(input) < 0.05) return true
  }
  return false
}

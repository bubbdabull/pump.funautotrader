/** Feed quality gates — only tradeable tokens are stored and shown by default. */

/** Strict “about to graduate” band (pump.fun ~85 SOL target). */
export const GRADUATING_CURVE_MIN = 70
export const GRADUATING_CURVE_MAX = 100

export interface FeedQualityFields {
  mint: string
  symbol?: string
  name?: string
  marketCap: number
  bondingCurvePercent: number
  holders: number
  volume24h: number
  liquidity?: number
  signalScore?: number
  aiRiskScore?: number
  momentumScore?: number
  /** Set when on-chain holder snapshot exists */
  holdersVerified?: boolean
}

export function entrySignal(token: FeedQualityFields): number {
  return token.signalScore ?? token.aiRiskScore ?? 50
}

export function activitySol(token: FeedQualityFields): number {
  if (token.volume24h > 0) return token.volume24h
  return token.liquidity ?? 0
}

export function isGraduatingSoon(token: FeedQualityFields): boolean {
  const curve = token.bondingCurvePercent
  return curve >= GRADUATING_CURVE_MIN && curve <= GRADUATING_CURVE_MAX
}

/** Minimum bar to track in market state (not necessarily shown). */
export function passesIngestGate(token: FeedQualityFields): boolean {
  if (!token.mint || token.mint.length < 32) return false
  if (!token.symbol?.trim() || token.symbol === 'UNKNOWN') return false
  const vol = activitySol(token)
  return token.marketCap >= 400 || vol >= 0.15 || token.holders >= 2
}

/** Base quality — filters obvious junk / empty launches. */
export function passesAlphaFilter(token: FeedQualityFields): boolean {
  const signal = entrySignal(token)
  const vol = activitySol(token)
  const curve = token.bondingCurvePercent

  if (!passesIngestGate(token)) return false
  if (curve < 3 || curve > 99) return false
  if (isGraduatingSoon(token)) return false
  if (signal > 76) return false
  if (vol < 0.08 && token.holders < 3) return false
  if ((token.momentumScore ?? 0) < 10 && vol < 0.2 && token.holders < 5) return false

  return true
}

/**
 * Tokens we would actually consider trading — stricter than alpha.
 * Requires real activity + holder depth (on-chain or stream).
 */
export function passesTradeableFilter(token: FeedQualityFields): boolean {
  if (!passesAlphaFilter(token)) return false

  const signal = entrySignal(token)
  const vol = activitySol(token)
  const holders = token.holders ?? 0
  const mom = token.momentumScore ?? 0

  if (token.marketCap < 1_500) return false
  if (signal > 68) return false

  const holderOk =
    holders >= 8 ||
    (holders >= 5 && vol >= 0.2) ||
    (holders >= 3 && vol >= 0.5 && mom >= 22) ||
    (token.holdersVerified === true && holders >= 3 && vol >= 0.15)

  if (!holderOk) return false
  if (vol < 0.15 && mom < 25) return false
  if (mom < 15 && vol < 0.35) return false

  return true
}

/** 0–100 ranking for feed storage cap (higher = show first). */
export function tradeQualityScore(token: FeedQualityFields): number {
  const signal = entrySignal(token)
  const vol = activitySol(token)
  const holders = Math.max(1, token.holders ?? 0)
  const mom = token.momentumScore ?? 0
  const curve = token.bondingCurvePercent

  const signalPts = Math.min(22, Math.max(0, (72 - signal) * 0.55))
  const momPts = Math.min(28, mom * 0.38)
  const volPts = Math.min(22, Math.log10(vol + 0.05) * 11)
  const holderPts = Math.min(18, Math.log10(holders + 1) * 9)
  const curvePts = Math.min(10, curve * 0.08)
  const verifiedBonus = token.holdersVerified ? 5 : 0

  return Math.round(signalPts + momPts + volPts + holderPts + curvePts + verifiedBonus)
}

export function rankTradeable<T extends FeedQualityFields>(tokens: T[], limit = 80): T[] {
  return [...tokens]
    .filter(passesTradeableFilter)
    .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
    .slice(0, limit)
}

export type ScannerLane = 'tradeable' | 'alpha' | 'graduating' | 'all'

export function pickNearGraduation<T extends FeedQualityFields>(
  tokens: T[],
  limit = 40,
  minCurve = 30,
): T[] {
  return [...tokens]
    .filter((t) => t.bondingCurvePercent >= minCurve)
    .sort((a, b) => b.bondingCurvePercent - a.bondingCurvePercent)
    .slice(0, limit)
}

export function filterForLane<T extends FeedQualityFields>(
  tokens: T[],
  lane: ScannerLane,
): T[] {
  switch (lane) {
    case 'graduating': {
      const strict = tokens
        .filter(isGraduatingSoon)
        .sort((a, b) => b.bondingCurvePercent - a.bondingCurvePercent)
      if (strict.length >= 3) return strict
      return pickNearGraduation(tokens)
    }
    case 'alpha':
      return [...tokens]
        .filter(passesAlphaFilter)
        .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
        .slice(0, 60)
    case 'all':
      return rankTradeable(tokens, 100)
    case 'tradeable':
    default:
      return rankTradeable(tokens, 80)
  }
}

/** Alpha feed gates — junk tokens never surface in the default scanner. */

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
}

export function entrySignal(token: FeedQualityFields): number {
  return token.signalScore ?? token.aiRiskScore ?? 50
}

export function activitySol(token: FeedQualityFields): number {
  if (token.volume24h > 0) return token.volume24h
  return token.liquidity ?? 0
}

/** Bonding curve filling — about to graduate to PumpSwap / Raydium */
export function isGraduatingSoon(token: FeedQualityFields): boolean {
  const curve = token.bondingCurvePercent
  return curve >= GRADUATING_CURVE_MIN && curve <= GRADUATING_CURVE_MAX
}

/**
 * Default alpha scanner: hide illiquid, ultra-risk, empty, or pre-graduation tokens.
 */
export function passesAlphaFilter(token: FeedQualityFields): boolean {
  const signal = entrySignal(token)
  const vol = activitySol(token)
  const curve = token.bondingCurvePercent

  if (!token.mint || token.mint.length < 32) return false
  if (!token.symbol?.trim() || token.symbol === 'UNKNOWN') return false
  if (token.marketCap < 500) return false
  if (curve < 2) return false
  if (isGraduatingSoon(token)) return false
  // signalScore = inverted EV (lower is better). Static/new tokens often land ~65–75 until trades refine scores.
  if (signal > 78) return false
  if (vol < 0.05 && token.holders < 2) return false
  if ((token.momentumScore ?? 0) < 8 && vol < 0.15 && token.holders < 3) return false

  return true
}

export type ScannerLane = 'alpha' | 'graduating' | 'all'

/** Top tokens by curve % when none are in the strict graduating band yet. */
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
      return tokens.filter(passesAlphaFilter)
    default:
      return tokens
  }
}

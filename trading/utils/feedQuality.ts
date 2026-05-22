import {
  isRecentlyActive,
  rankByLiveActivity,
  rankScannerQuality,
} from './liveActivity'

/** Feed quality gates — only tradeable tokens are stored and shown by default. */

/** Strict “about to graduate” band (pump.fun ~85 SOL target). */
export const GRADUATING_CURVE_MIN = 70
export const GRADUATING_CURVE_MAX = 100

/** Tradeable lane thresholds (tuned anti-rug — conservative). */
export const TRADEABLE_MIN_MARKET_CAP_USD = 8_000
export const TRADEABLE_MAX_SIGNAL = 62
export const TRADEABLE_MIN_VOL_SOL = 0.35
export const TRADEABLE_MIN_MOMENTUM = 18
/** On-chain verified holder floor (Helius / Bubblemaps). */
export const TRADEABLE_MIN_HOLDERS_VERIFIED = 10
/** Stream trader count (bonding curve — no SPL accounts yet). */
export const TRADEABLE_MIN_HOLDERS_UNVERIFIED = 18

/** Scanner / All Live — hide 1–2 wallet rugs; use trades1m as proxy on bonding curve. */
export const SCANNER_MIN_HOLDERS = 3

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
  lastTradeAt?: number
  isActive?: boolean
  trades1m?: number
  volume5mSol?: number
}

export function entrySignal(token: FeedQualityFields): number {
  return token.signalScore ?? token.aiRiskScore ?? 50
}

export function activitySol(token: FeedQualityFields): number {
  if (token.volume24h > 0) return token.volume24h
  return token.liquidity ?? 0
}

/** Holders for gating — verified on-chain, else max(stream holders, recent trade count). */
export function effectiveHolderCount(token: FeedQualityFields): number {
  const h = token.holders ?? 0
  const trades = token.trades1m ?? 0
  if (token.holdersVerified && h >= 2) return h
  return Math.max(h, trades >= 2 ? trades : 0)
}

export function passesMinHolderDepth(token: FeedQualityFields): boolean {
  return effectiveHolderCount(token) >= SCANNER_MIN_HOLDERS
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
  return token.marketCap >= 800 || vol >= 0.2 || token.holders >= 3
}

/** Watchlist — broader than tradeable but still filters junk. */
export function passesAlphaFilter(token: FeedQualityFields): boolean {
  const signal = entrySignal(token)
  const vol = activitySol(token)
  const curve = token.bondingCurvePercent

  if (!passesIngestGate(token)) return false
  if (curve < 5 || curve > 99) return false
  if (isGraduatingSoon(token)) return false
  if (signal > 72) return false
  if (token.marketCap < 3_000) return false
  if (effectiveHolderCount(token) < SCANNER_MIN_HOLDERS && vol < 0.2) return false
  if (vol < 0.12 && effectiveHolderCount(token) < 8) return false
  if ((token.momentumScore ?? 0) < 12 && vol < 0.3 && effectiveHolderCount(token) < 12) return false

  return true
}

/**
 * Tokens we would actually trade — conservative anti-rug bar.
 * Prefer on-chain holder verification; high mcap + volume + holder depth.
 */
export function passesTradeableFilter(token: FeedQualityFields): boolean {
  if (!passesAlphaFilter(token)) return false

  const signal = entrySignal(token)
  const vol = activitySol(token)
  const holders = token.holders ?? 0
  const mom = token.momentumScore ?? 0
  const verified = token.holdersVerified === true
  const hasPumpPortalTicks =
    token.isActive === true || (token.trades1m ?? 0) > 0 || (token.volume5mSol ?? 0) > 0.01

  /** Live PumpPortal ticks — still require multi-wallet activity. */
  if (hasPumpPortalTicks) {
    if (token.marketCap < 4_000) return false
    if (signal > 68) return false
    if (vol < 0.12) return false
    if (mom < 12) return false
    if (!passesMinHolderDepth(token)) return false
    if ((token.trades1m ?? 0) < 2 && effectiveHolderCount(token) < 4) return false
    return true
  }

  if (token.marketCap < TRADEABLE_MIN_MARKET_CAP_USD) return false
  if (signal > TRADEABLE_MAX_SIGNAL) return false
  if (vol < TRADEABLE_MIN_VOL_SOL) return false
  if (mom < TRADEABLE_MIN_MOMENTUM) return false

  // Bonding curve band: skip brand-new illiquid launches (common rug window)
  const curve = token.bondingCurvePercent
  if (curve < 8 && vol < 1.0) return false

  if (verified) {
    if (holders < TRADEABLE_MIN_HOLDERS_VERIFIED) return false
    if (holders < 18 && vol < 0.55) return false
    if (holders < 35 && signal > 55) return false
    return true
  }

  // Without on-chain proof, demand strong stream activity (still anti-rug)
  if (holders < TRADEABLE_MIN_HOLDERS_UNVERIFIED) return false
  if (vol < 0.45) return false
  if (mom < 28) return false
  if (signal > 55) return false
  if (token.marketCap < 12_000) return false

  return true
}

export type FeedDisplayMode = 'active' | 'tradeable' | 'watchlist_fallback'

/** Best tokens to show — live ticks first, then tradeable, else watchlist. */
export function resolveDisplayFeed<T extends FeedQualityFields>(
  tokens: T[],
  limit = 80,
): { tokens: T[]; mode: FeedDisplayMode; tradeableCount: number } {
  const tradeableCount = tokens.filter(passesTradeableFilter).length
  const active = rankByLiveActivity(tokens, limit)
  if (active.length >= 3) {
    return { tokens: active, mode: 'active', tradeableCount }
  }
  const tradeable = rankTradeable(tokens, limit)
  if (tradeable.length > 0) {
    return { tokens: tradeable, mode: 'tradeable', tradeableCount }
  }
  const fallback = [...tokens]
    .filter(passesAlphaFilter)
    .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
    .slice(0, limit)
  return { tokens: fallback, mode: 'watchlist_fallback', tradeableCount }
}

/** 0–100 ranking for feed storage cap (higher = show first). */
export function tradeQualityScore(token: FeedQualityFields): number {
  const signal = entrySignal(token)
  const vol = activitySol(token)
  const holders = Math.max(1, token.holders ?? 0)
  const mom = token.momentumScore ?? 0
  const curve = token.bondingCurvePercent

  const signalPts = Math.min(25, Math.max(0, (65 - signal) * 0.65))
  const momPts = Math.min(22, mom * 0.32)
  const volPts = Math.min(22, Math.log10(vol + 0.05) * 12)
  const holderPts = Math.min(22, Math.log10(holders + 1) * 11)
  const mcapPts = Math.min(8, Math.log10(token.marketCap + 1) * 2)
  const curvePts = Math.min(6, curve * 0.05)
  const verifiedBonus = token.holdersVerified ? 8 : 0
  const liveBonus = isRecentlyActive(token) ? 15 : 0

  return Math.round(
    signalPts + momPts + volPts + holderPts + mcapPts + curvePts + verifiedBonus + liveBonus,
  )
}

export function rankTradeable<T extends FeedQualityFields>(tokens: T[], limit = 80): T[] {
  return [...tokens]
    .filter(passesTradeableFilter)
    .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
    .slice(0, limit)
}

export type ScannerLane = 'tradeable' | 'active' | 'alpha' | 'graduating' | 'all'

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
    case 'active':
      return rankByLiveActivity(tokens, 60)
    case 'alpha':
    case 'all':
      return rankScannerQuality(tokens, lane === 'all' ? 100 : 60)
    case 'tradeable':
    default:
      return resolveDisplayFeed(tokens, 80).tokens
  }
}

export {
  isRecentlyActive,
  hasRealTimeTradeActivity,
  isDeadFeedToken,
  liveActivityScore,
  passesActiveScannerFilter,
  passesScannerQualityFilter,
  passesTradingActivity,
  rankByLiveActivity,
  rankScannerQuality,
  MIN_LIVE_VOLUME_5M_SOL,
  MIN_FEED_VOLUME_24H_SOL,
} from './liveActivity'

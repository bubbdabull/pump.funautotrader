import {
  isRecentlyActive,
  hasRealTimeTradeActivity,
  isDeadFeedToken,
  liveActivityScore,
  passesTradingActivity,
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

export type FeedQualityWithActivity = FeedQualityFields & {
  lastTradeAt?: number
  isActive?: boolean
  trades1m?: number
  volume5mSol?: number
  /** Pipeline readiness — only `invalid` is excluded from live UI lanes */
  dataState?: TokenDataState
}

export type TokenDataState = 'raw' | 'enriching' | 'active' | 'invalid'

/** High-confidence trade candidate bar (partial data allowed). */
export const TRADEABLE_CONFIDENCE_THRESHOLD = 58

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

export function hasStreamTicks(token: FeedQualityWithActivity): boolean {
  return (
    token.isActive === true ||
    (token.trades1m ?? 0) > 0 ||
    (token.volume5mSol ?? 0) >= 0.01
  )
}

/** Resolve enrichment lifecycle for registry rows. */
export function resolveTokenDataState(
  token: FeedQualityWithActivity,
  now = Date.now(),
): TokenDataState {
  if (!passesIngestGate(token) || isDeadFeedToken(token, now)) return 'invalid'

  const live = hasRealTimeTradeActivity(token, now) || hasStreamTicks(token)
  const score = feedConfidenceScore(token, now)

  if (score >= TRADEABLE_CONFIDENCE_THRESHOLD + 12) return 'active'
  if (token.holdersVerified && (token.holders ?? 0) >= 2 && live) return 'active'
  if (live && !token.holdersVerified) return 'enriching'
  if (live) return 'enriching'
  if (passesAlphaFilter(token) || activitySol(token) >= 0.15) return 'raw'
  return 'invalid'
}

/** Watchlist — broader than tradeable but still filters junk. */
export function passesAlphaFilter(token: FeedQualityFields): boolean {
  const signal = entrySignal(token)
  const vol = activitySol(token)
  const curve = token.bondingCurvePercent

  if (!passesIngestGate(token)) return false

  if (hasStreamTicks(token as FeedQualityWithActivity)) {
    if (signal > 85) return false
    if (token.marketCap < 500) return false
    return true
  }

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
 * High-confidence trade candidates — score-based, not “all fields complete”.
 * Missing holder enrichment reduces confidence; does not hard-reject live stream rows.
 */
export function passesTradeableFilter(
  token: FeedQualityFields,
  now = Date.now(),
): boolean {
  if (!passesIngestGate(token) || isDeadFeedToken(token as FeedQualityWithActivity, now)) {
    return false
  }
  return feedConfidenceScore(token, now) >= TRADEABLE_CONFIDENCE_THRESHOLD
}

export type FeedStreamState = 'live' | 'low_confidence' | 'invalid'

export type FeedDisplayMode = 'active' | 'tradeable' | 'low_confidence' | 'watchlist_fallback'

export type ResolveDisplayFeedOptions = {
  /** When true, never return watchlist_fallback if any live stream rows exist. */
  streamConnected?: boolean
}

/** 0–100 progressive confidence (missing fields = penalty, not rejection). */
export function feedConfidenceScore(token: FeedQualityFields, now = Date.now()): number {
  if (!passesIngestGate(token) || isDeadFeedToken(token as FeedQualityWithActivity, now)) {
    return 0
  }

  let score = 18
  const live = hasRealTimeTradeActivity(token as FeedQualityWithActivity, now)
  if (live || token.isActive) score += 36
  if ((token.trades1m ?? 0) >= 1) score += 6
  if ((token.volume5mSol ?? 0) >= 0.05) score += 8
  score += Math.min(16, tradeQualityScore(token) * 0.14)
  score += Math.min(12, effectiveHolderCount(token) * 1.8)
  if (token.holdersVerified) score += 10
  else if (live) score -= 4

  const signal = entrySignal(token)
  if (signal <= 55) score += 8
  else if (signal > 72) score -= 10

  const mom = token.momentumScore ?? 0
  if (mom >= 22) score += 5

  return Math.min(100, Math.round(score))
}

export function classifyFeedStreamState(
  token: FeedQualityWithActivity,
  now = Date.now(),
): FeedStreamState {
  const dataState = token.dataState ?? resolveTokenDataState(token, now)
  if (dataState === 'invalid') return 'invalid'
  if (dataState === 'active' || passesTradeableFilter(token, now)) return 'live'
  return 'low_confidence'
}

export function tradeableRejectionReasons(
  token: FeedQualityFields,
  now = Date.now(),
): string[] {
  const reasons: string[] = []
  if (!passesIngestGate(token)) reasons.push('ingest_gate')
  if (isDeadFeedToken(token as FeedQualityWithActivity, now)) reasons.push('stale')
  if (passesTradeableFilter(token, now)) return reasons

  const score = feedConfidenceScore(token, now)
  if (score < TRADEABLE_CONFIDENCE_THRESHOLD) reasons.push('low_confidence')

  const signal = entrySignal(token)
  const vol = activitySol(token)
  if (token.marketCap < TRADEABLE_MIN_MARKET_CAP_USD) reasons.push('low_mcap')
  if (signal > TRADEABLE_MAX_SIGNAL) reasons.push('high_risk_signal')
  if (vol < TRADEABLE_MIN_VOL_SOL) reasons.push('low_volume')
  if ((token.momentumScore ?? 0) < TRADEABLE_MIN_MOMENTUM) reasons.push('low_momentum')
  if (!passesMinHolderDepth(token)) reasons.push('thin_holders')
  if (!token.holdersVerified) reasons.push('holders_enriching')

  if (reasons.length === 0) reasons.push('below_tradeable_score')
  return reasons
}

/** Live stream rows — WS ticks without full alpha/tradeable bar. */
export function rankLiveStreamFeed<T extends FeedQualityWithActivity>(
  tokens: T[],
  limit = 80,
): T[] {
  const now = Date.now()
  return [...tokens]
    .filter((t) => resolveTokenDataState(t, now) !== 'invalid')
    .filter(
      (t) =>
        hasRealTimeTradeActivity(t, now) ||
        hasStreamTicks(t) ||
        passesTradingActivity(t),
    )
    .sort((a, b) => liveActivityScore(b, now) - liveActivityScore(a, now))
    .slice(0, limit)
}

/** Best tokens to show — live ticks first, then tradeable, else watchlist. */
export function resolveDisplayFeed<T extends FeedQualityFields & FeedQualityWithActivity>(
  tokens: T[],
  limit = 80,
  options?: ResolveDisplayFeedOptions,
): { tokens: T[]; mode: FeedDisplayMode; tradeableCount: number } {
  const now = Date.now()
  const tradeableCount = tokens.filter((t) => passesTradeableFilter(t, now)).length

  const strictActive = rankByLiveActivity(tokens, limit)
  if (strictActive.length >= 1) {
    return { tokens: strictActive, mode: 'active', tradeableCount }
  }

  const liveStream = rankLiveStreamFeed(tokens, limit)
  if (liveStream.length >= 1) {
    const mode: FeedDisplayMode =
      tradeableCount > 0 ? 'active' : 'low_confidence'
    return { tokens: liveStream, mode, tradeableCount }
  }

  if (options?.streamConnected) {
    const streamVisible = [...tokens]
      .filter((t) => resolveTokenDataState(t, now) !== 'invalid')
      .sort((a, b) => liveActivityScore(b, now) - liveActivityScore(a, now))
      .slice(0, limit)
    if (streamVisible.length > 0) {
      const mode: FeedDisplayMode =
        tradeableCount > 0 ? 'tradeable' : 'low_confidence'
      return { tokens: streamVisible, mode, tradeableCount }
    }
  }

  const tradeable = rankTradeable(tokens, limit)
  if (tradeable.length > 0) {
    return { tokens: tradeable, mode: 'tradeable', tradeableCount }
  }

  const lowConfidence = [...tokens]
    .filter((t) => classifyFeedStreamState(t, now) === 'low_confidence')
    .sort((a, b) => feedConfidenceScore(b, now) - feedConfidenceScore(a, now))
    .slice(0, limit)
  if (lowConfidence.length > 0) {
    return { tokens: lowConfidence, mode: 'low_confidence', tradeableCount }
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

/** All Live lane — broader than rankScannerQuality; still anti-rug. */
export function rankAllLiveFeed<T extends FeedQualityFields & FeedQualityWithActivity>(
  tokens: T[],
  limit = 120,
): T[] {
  const now = Date.now()
  return [...tokens]
    .filter((t) => resolveTokenDataState(t, now) !== 'invalid')
    .sort((a, b) => liveActivityScore(b, now) - liveActivityScore(a, now))
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
    case 'all':
      return rankAllLiveFeed(tokens, 120)
    case 'alpha':
      return rankScannerQuality(tokens, 60)
    case 'tradeable':
    default:
      return resolveDisplayFeed(tokens, 80).tokens
  }
}

export {
  isRecentlyActive,
  hasRealTimeTradeActivity,
  hasRestMarketActivity,
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

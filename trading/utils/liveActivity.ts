import type { FeedQualityFields } from './feedQuality'
import {
  activitySol,
  passesAlphaFilter,
  passesIngestGate,
  passesMinHolderDepth,
  tradeQualityScore,
} from './feedQuality'

/** Token traded within this window counts as "live" on the scanner. */
export const LIVE_ACTIVITY_MAX_AGE_MS = 120_000

/** Min 5m streamed volume (SOL) to count as real activity — filters wash/dead ticks. */
export const MIN_LIVE_VOLUME_5M_SOL = 0.01
/** Min 24h volume (SOL) to keep a bootstrap row without WS ticks. */
export const MIN_FEED_VOLUME_24H_SOL = 0.22

export type FeedQualityWithActivity = FeedQualityFields & {
  lastTradeAt?: number
  isActive?: boolean
  trades1m?: number
  volume5mSol?: number
}

/** Recent pump.fun REST trade time (bootstrap / DB) — not PumpPortal WS ticks. */
export function hasRestMarketActivity(
  token: FeedQualityWithActivity,
  now = Date.now(),
  maxAgeMs = 600_000,
): boolean {
  const last = token.lastTradeAt ?? 0
  if (!last || now - last > maxAgeMs) return false
  return activitySol(token) >= MIN_FEED_VOLUME_24H_SOL * 0.5
}

/** Live ticks (WS) or recent REST/DB trade timestamp with volume. */
export function hasRealTimeTradeActivity(
  token: FeedQualityWithActivity,
  now = Date.now(),
): boolean {
  const vol5 = token.volume5mSol ?? 0
  const trades1m = token.trades1m ?? 0
  if (trades1m >= 1) return true
  if (token.isActive) return true
  if (
    token.lastTradeAt &&
    now - token.lastTradeAt < LIVE_ACTIVITY_MAX_AGE_MS &&
    vol5 >= MIN_LIVE_VOLUME_5M_SOL
  ) {
    return true
  }
  if (hasRestMarketActivity(token, now, LIVE_ACTIVITY_MAX_AGE_MS)) return true
  return false
}

/** Loose signal for ranking (includes recent tick without volume yet). */
export function isRecentlyActive(token: FeedQualityWithActivity, now = Date.now()): boolean {
  return hasRealTimeTradeActivity(token, now)
}

/** Dead = no meaningful recent volume — exempt from feed, subs, and active lane. */
export function isDeadFeedToken(token: FeedQualityWithActivity, now = Date.now()): boolean {
  if (hasRealTimeTradeActivity(token, now)) return false

  const vol5 = token.volume5mSol ?? 0
  const trades1m = token.trades1m ?? 0
  const vol24 = activitySol(token)
  const last = token.lastTradeAt ?? 0
  const hasWsTicks = trades1m > 0 || token.isActive || vol5 >= MIN_LIVE_VOLUME_5M_SOL
  if (hasWsTicks) return false

  const stale = last === 0 || now - last > 10 * 60_000
  if (!stale && last > 0 && !hasWsTicks) {
    return vol24 < MIN_FEED_VOLUME_24H_SOL
  }

  if (trades1m > 0 || vol5 >= MIN_LIVE_VOLUME_5M_SOL) return false
  if (vol24 >= MIN_FEED_VOLUME_24H_SOL * 1.5) return false
  if (stale && vol24 < MIN_FEED_VOLUME_24H_SOL && vol5 < MIN_LIVE_VOLUME_5M_SOL) return true
  return false
}

/** Higher = more live — used for feed ordering and subscriptions. */
export function liveActivityScore(token: FeedQualityWithActivity, now = Date.now()): number {
  let score = 0
  if (token.isActive) score += 800
  if (token.lastTradeAt) {
    const ageSec = (now - token.lastTradeAt) / 1000
    score += Math.max(0, 400 - ageSec * 3)
  }
  score += Math.min(200, (token.trades1m ?? 0) * 25)
  score += Math.min(80, (token.volume5mSol ?? 0) * 40)
  score += tradeQualityScore(token) * 0.4
  return score
}

/** Hot lane — live ticks first; alpha/holder bar for REST-only rows. */
export function passesActiveScannerFilter(
  token: FeedQualityWithActivity,
  now = Date.now(),
): boolean {
  if (!passesIngestGate(token) || isDeadFeedToken(token, now)) return false
  if (hasRealTimeTradeActivity(token, now) || token.isActive) return true
  if (!passesAlphaFilter(token)) return false
  if (!passesMinHolderDepth(token)) return false
  return hasRealTimeTradeActivity(token, now)
}

/** Meaningful volume or live ticks — not a dead bootstrap row. */
export function passesTradingActivity(token: FeedQualityWithActivity): boolean {
  if (hasRealTimeTradeActivity(token)) return true
  if (hasRestMarketActivity(token)) return true
  if (activitySol(token) >= MIN_FEED_VOLUME_24H_SOL) return true
  if ((token.trades1m ?? 0) >= 2 && (token.volume5mSol ?? 0) >= 0.02) return true
  return false
}

/**
 * All Live / Alpha — trading activity + at least 3 holders/traders (not 1–2 wallet rugs).
 */
export function passesScannerQualityFilter(token: FeedQualityWithActivity): boolean {
  if (!passesAlphaFilter(token)) return false
  if (isDeadFeedToken(token)) return false
  if (!passesTradingActivity(token)) return false
  if (!passesMinHolderDepth(token)) return false
  return true
}

export function rankScannerQuality<T extends FeedQualityWithActivity>(
  tokens: T[],
  limit = 100,
): T[] {
  const now = Date.now()
  return [...tokens]
    .filter(passesScannerQualityFilter)
    .sort((a, b) => liveActivityScore(b, now) - liveActivityScore(a, now))
    .slice(0, limit)
}

export function rankByLiveActivity<T extends FeedQualityWithActivity>(
  tokens: T[],
  limit = 60,
): T[] {
  const now = Date.now()
  return [...tokens]
    .filter((t) => passesActiveScannerFilter(t))
    .sort((a, b) => liveActivityScore(b, now) - liveActivityScore(a, now))
    .slice(0, limit)
}

import type { FeedQualityFields } from './feedQuality'
import { activitySol, passesAlphaFilter, tradeQualityScore } from './feedQuality'

/** Token traded within this window counts as "live" on the scanner. */
export const LIVE_ACTIVITY_MAX_AGE_MS = 120_000

/** Min 5m streamed volume (SOL) to count as real activity — filters wash/dead ticks. */
export const MIN_LIVE_VOLUME_5M_SOL = 0.04
/** Min 24h volume (SOL) to keep a bootstrap row without WS ticks. */
export const MIN_FEED_VOLUME_24H_SOL = 0.22

export type FeedQualityWithActivity = FeedQualityFields & {
  lastTradeAt?: number
  isActive?: boolean
  trades1m?: number
  volume5mSol?: number
}

/** WS / in-memory ticks only — not pump.fun REST timestamps alone. */
export function hasRealTimeTradeActivity(
  token: FeedQualityWithActivity,
  now = Date.now(),
): boolean {
  const vol5 = token.volume5mSol ?? 0
  const trades1m = token.trades1m ?? 0
  if (trades1m >= 1 && vol5 >= MIN_LIVE_VOLUME_5M_SOL) return true
  if (token.isActive && vol5 >= MIN_LIVE_VOLUME_5M_SOL) return true
  if (
    token.lastTradeAt &&
    now - token.lastTradeAt < LIVE_ACTIVITY_MAX_AGE_MS &&
    vol5 >= MIN_LIVE_VOLUME_5M_SOL * 1.5
  ) {
    return true
  }
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
  const stale = last === 0 || now - last > 5 * 60_000

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

/** Scanner row must have real-time ticks + minimum volume (not stale bootstrap). */
export function passesActiveScannerFilter(token: FeedQualityWithActivity): boolean {
  if (!passesAlphaFilter(token)) return false
  if (isDeadFeedToken(token)) return false
  return hasRealTimeTradeActivity(token)
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

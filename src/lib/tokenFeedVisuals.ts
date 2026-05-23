import type { PumpToken } from '@/types'
import { isGraduatingSoon, GRADUATING_CURVE_MIN } from '@/lib/feedQuality'

export type ConfidenceTier = 'high' | 'medium' | 'low'

export type FlowVisual = 'inflow' | 'sell' | 'neutral' | 'active'

export type FeedBadge =
  | 'RAW'
  | 'HOT'
  | 'MIGRATING'
  | 'SMART MONEY IN'
  | 'BREAKOUT RISK'

export function confidenceTier(token: PumpToken): ConfidenceTier {
  const score = token.confidenceScore ?? (token.score ?? 0) / 100
  if (score >= 0.7 || (token.score ?? 0) >= 70) return 'high'
  if (score >= 0.4 || (token.score ?? 0) >= 40) return 'medium'
  return 'low'
}

export function flowVisual(token: PumpToken): FlowVisual {
  if (token.isActive) return 'active'
  if (token.smartMoneyFlow === 'SMART_MONEY_EXIT') return 'sell'
  const buy = token.buyPressure1m
  if (buy != null && buy >= 58) return 'inflow'
  if (buy != null && buy <= 42) return 'sell'
  return 'neutral'
}

export function tokenAgeMs(token: PumpToken): number {
  const t = Date.parse(token.launchedAt)
  return Number.isFinite(t) ? Date.now() - t : Infinity
}

export function isNewLaunch(token: PumpToken, maxAgeMs = 15 * 60_000): boolean {
  return tokenAgeMs(token) < maxAgeMs
}

export function feedBadges(token: PumpToken): FeedBadge[] {
  const badges: FeedBadge[] = []
  if (token.signalState === 'RAW_SIGNAL' || isNewLaunch(token)) badges.push('RAW')
  if (token.isActive || token.signalState === 'MOMENTUM_SIGNAL') badges.push('HOT')
  if (
    token.lifecycle === 'MIGRATION_WATCH' ||
    token.lifecycle === 'MIGRATED' ||
    isGraduatingSoon(token) ||
    token.bondingCurvePercent >= GRADUATING_CURVE_MIN
  ) {
    badges.push('MIGRATING')
  }
  if (token.smartMoneyFlow === 'SMART_MONEY_IN') badges.push('SMART MONEY IN')
  if (
    token.pumpSignal === 'EARLY_BREAKOUT' ||
    token.pumpSignal === 'FAKEOUT_RISK' ||
    (token.pumpProbabilityScore ?? 0) >= 65
  ) {
    badges.push('BREAKOUT RISK')
  }
  return badges
}

export function formatTokenAge(token: PumpToken): string {
  const ms = tokenAgeMs(token)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

import type { PumpToken } from '@/types'
import { feedConfidenceScore, isGraduatingSoon, GRADUATING_CURVE_MIN } from '@/lib/feedQuality'

export type ConfidenceTier = 'high' | 'medium' | 'low'

export type FlowVisual = 'inflow' | 'sell' | 'neutral' | 'active'

export function confidenceTier(token: PumpToken): ConfidenceTier {
  const score = feedConfidenceScore(token)
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function flowVisual(token: PumpToken): FlowVisual {
  if (token.isActive) return 'active'
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

export function feedBadges(token: PumpToken): Array<'NEW' | 'HOT' | 'MIGRATING'> {
  const badges: Array<'NEW' | 'HOT' | 'MIGRATING'> = []
  if (isNewLaunch(token)) badges.push('NEW')
  if (token.isActive) badges.push('HOT')
  if (
    token.lifecycle === 'MIGRATION_WATCH' ||
    token.lifecycle === 'MIGRATED' ||
    isGraduatingSoon(token) ||
    token.bondingCurvePercent >= GRADUATING_CURVE_MIN
  ) {
    badges.push('MIGRATING')
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

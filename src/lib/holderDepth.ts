import type { PumpToken } from '@/types'

/** 0–100 holder depth / decentralization (higher = healthier distribution). */
export function holderDepthScore(
  token: Pick<PumpToken, 'top1Pct' | 'top5Pct' | 'holdersVerified'>,
): number | undefined {
  if (token.top1Pct == null) return undefined
  const top5 = token.top5Pct ?? token.top1Pct
  const concentration = token.top1Pct * 0.55 + top5 * 0.35
  const verifiedBoost = token.holdersVerified ? 8 : 0
  return Math.round(Math.min(100, Math.max(0, 100 - concentration + verifiedBoost)))
}

export function walletDiversityScore(
  token: Pick<PumpToken, 'top1Pct' | 'top5Pct' | 'holders'>,
): number | undefined {
  if (token.top1Pct == null || token.holders < 2) return undefined
  const spread = Math.max(0, 100 - (token.top5Pct ?? token.top1Pct))
  const sizeFactor = Math.min(1, token.holders / 80)
  return Math.round(spread * 0.7 * sizeFactor + 30 * sizeFactor)
}

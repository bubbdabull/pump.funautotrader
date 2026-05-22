import { clamp01 } from './math'

export interface WalletBalanceRow {
  wallet: string
  amount: number
}

/** Shannon-like entropy of supply distribution (0–1, higher = more dispersed). */
export function holderEntropyFromAmounts(amounts: number[]): number {
  const positive = amounts.filter((a) => a > 0)
  const total = positive.reduce((a, b) => a + b, 0)
  if (total <= 0 || positive.length < 2) return 0

  let h = 0
  for (const a of positive) {
    const p = a / total
    if (p > 0) h -= p * Math.log(p)
  }
  const maxH = Math.log(positive.length)
  return maxH > 0 ? clamp01(h / maxH) : 0
}

export function distributionFromAmounts(amounts: number[]): {
  top1Pct: number
  top5Pct: number
  entropy: number
} {
  const positive = amounts.filter((a) => a > 0)
  const total = positive.reduce((a, b) => a + b, 0)
  if (total <= 0) {
    return { top1Pct: 0, top5Pct: 0, entropy: 0 }
  }
  const sorted = [...positive].sort((a, b) => b - a)
  const top1Pct = (sorted[0] ?? 0) / total
  const top5Pct = sorted.slice(0, 5).reduce((a, b) => a + b, 0) / total
  return {
    top1Pct,
    top5Pct,
    entropy: holderEntropyFromAmounts(positive),
  }
}

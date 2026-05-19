export function clamp01(x: number): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** Normalize value into [0,1] using logistic squash around midpoint. */
export function logistic01(x: number, midpoint = 0.5, steepness = 6): number {
  return clamp01(1 / (1 + Math.exp(-steepness * (x - midpoint))))
}

/** Shannon entropy normalized to [0,1] for n wallets. */
export function normalizedEntropy(shares: number[]): number {
  if (shares.length === 0) return 0
  const total = shares.reduce((a, b) => a + b, 0)
  if (total <= 0) return 0
  let h = 0
  for (const s of shares) {
    if (s <= 0) continue
    const p = s / total
    h -= p * Math.log(p)
  }
  const maxH = Math.log(shares.length)
  return maxH > 0 ? clamp01(h / maxH) : 0
}

export function linearRegressionSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0
  const n = points.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }
  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-12) return 0
  return (n * sumXY - sumX * sumY) / denom
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 1
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / Math.abs(mean)
}

export function ema(values: number[], alpha = 0.3): number[] {
  if (values.length === 0) return []
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(alpha * values[i] + (1 - alpha) * out[i - 1])
  }
  return out
}

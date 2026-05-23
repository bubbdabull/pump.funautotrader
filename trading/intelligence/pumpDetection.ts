import type { IntelligenceInput, PumpDetectionLabel } from './types'
export interface PumpDetectionResult {
  pumpProbabilityScore: number
  pumpSignal: PumpDetectionLabel
}

function tokenAgeMin(input: IntelligenceInput, now: number): number {
  if (!input.launchedAt) return 9999
  const t =
    typeof input.launchedAt === 'number'
      ? input.launchedAt
      : Date.parse(input.launchedAt)
  if (!Number.isFinite(t)) return 9999
  return (now - t) / 60_000
}

export function detectPump(
  input: IntelligenceInput,
  unifiedScore: number,
  now = Date.now(),
): PumpDetectionResult {
  const a = input.analytics
  const ageMin = tokenAgeMin(input, now)
  const vol5 = input.volume5mSol ?? a?.windows.w30.volumeSol ?? 0
  const trades = input.trades1m ?? a?.windows.w60.tradeCount ?? 0
  const buyPressure =
    input.buyPressure1m != null
      ? input.buyPressure1m / 100
      : (a?.buyPressure1m ?? 0.5)

  let prob = 8

  if (ageMin <= 8) prob += 18
  else if (ageMin <= 20) prob += 10

  if (a) {
    prob += Math.min(28, a.burst.ignitionScore * 28)
    prob += Math.min(18, a.velocity.volumeAcceleration * 0.35)
    prob += Math.min(12, a.velocity.tradeAcceleration * 0.25)
    prob += Math.min(10, a.velocity.walletVelocity * 0.2)
  }

  prob += Math.min(15, Math.log10(vol5 + 0.02) * 10)
  prob += Math.min(12, trades * 1.8)
  prob += buyPressure >= 0.55 ? 10 : buyPressure <= 0.4 ? -8 : 0
  prob += unifiedScore * 0.12

  const coord = input.analytics?.coordinationPenalty ?? 0
  if (coord > 0.4) prob -= 15
  const top1 = input.top1Pct != null ? (input.top1Pct > 1 ? input.top1Pct : input.top1Pct * 100) : 0
  if (top1 > 45) prob -= 12

  prob = Math.max(0, Math.min(100, Math.round(prob)))

  let pumpSignal: PumpDetectionLabel = 'NO_SIGNAL'
  if (prob >= 68 && buyPressure >= 0.52 && ageMin <= 25) {
    pumpSignal = 'EARLY_BREAKOUT'
  } else if (prob >= 45 && buyPressure >= 0.48 && vol5 >= 0.06) {
    pumpSignal = 'ACCUMULATION_PHASE'
  } else if (prob >= 40 && buyPressure < 0.42 && sellPressureHigh(buyPressure, trades)) {
    pumpSignal = 'FAKEOUT_RISK'
  }

  return { pumpProbabilityScore: prob, pumpSignal }
}

function sellPressureHigh(buyPressure: number, trades: number): boolean {
  return buyPressure < 0.42 && trades >= 4
}

export function pumpAlertThreshold(): number {
  return 72
}

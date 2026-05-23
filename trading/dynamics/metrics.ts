import { clamp01 } from '../utils/math'
import type {
  BurstMetrics,
  DynamicsWindowKey,
  MigrationProbability,
  VelocityMetrics,
  WindowMetrics,
} from './types'
import { DYNAMICS_WINDOWS } from './types'
import type { TimeBucketRing } from './timeBuckets'

export function buildWindowMetrics(
  ring: TimeBucketRing,
  key: DynamicsWindowKey,
  now: number,
): WindowMetrics {
  const agg = ring.aggregate(DYNAMICS_WINDOWS[key], now)
  const total = agg.buyVol + agg.sellVol
  return {
    volumeSol: agg.volumeSol,
    buyVol: agg.buyVol,
    sellVol: agg.sellVol,
    buys: agg.buys,
    sells: agg.sells,
    tradeCount: agg.tradeCount,
    uniqueWallets: agg.uniqueWallets,
    liquidityStart: agg.liquidityStart,
    liquidityEnd: agg.liquidityEnd,
    mcapStart: agg.mcapStart,
    mcapEnd: agg.mcapEnd,
    buyPressure: total > 0 ? agg.buyVol / total : 0.5,
  }
}

function ratePerSec(value: number, windowMs: number): number {
  return value / Math.max(1, windowMs / 1000)
}

export function computeVelocity(
  w5: WindowMetrics,
  w15: WindowMetrics,
  w30: WindowMetrics,
  w60: WindowMetrics,
): VelocityMetrics {
  const volumeVelocity =
    ratePerSec(w5.volumeSol, 5000) - ratePerSec(w30.volumeSol, 30000) * 0.15
  const walletVelocity =
    ratePerSec(w5.uniqueWallets, 5000) - ratePerSec(w60.uniqueWallets, 60000) * 0.08
  const tradeVelocity =
    ratePerSec(w5.tradeCount, 5000) - ratePerSec(w60.tradeCount, 60000) * 0.08
  const mcapDelta = w15.mcapEnd - w15.mcapStart
  const marketCapVelocity = mcapDelta / Math.max(1, w15.mcapStart) / 15

  const prevVolVel = ratePerSec(w15.volumeSol, 15000) - ratePerSec(w60.volumeSol, 60000) * 0.1
  const prevWalletVel =
    ratePerSec(w15.uniqueWallets, 15000) - ratePerSec(w60.uniqueWallets, 60000) * 0.05
  const prevTradeVel =
    ratePerSec(w15.tradeCount, 15000) - ratePerSec(w60.tradeCount, 60000) * 0.05

  return {
    volumeVelocity,
    walletVelocity,
    tradeVelocity,
    marketCapVelocity,
    volumeAcceleration: volumeVelocity - prevVolVel,
    walletAcceleration: walletVelocity - prevWalletVel,
    tradeAcceleration: tradeVelocity - prevTradeVel,
  }
}

export function computeBurst(w5: WindowMetrics, w15: WindowMetrics, w30: WindowMetrics, w60: WindowMetrics): BurstMetrics {
  const prev5Rate = ratePerSec(w30.volumeSol - w5.volumeSol, 25000)
  const last5Rate = ratePerSec(w5.volumeSol, 5000)
  const volumeBurst = last5Rate / Math.max(0.02, prev5Rate)

  const prevWalletRate = ratePerSec(Math.max(0, w60.uniqueWallets - w15.uniqueWallets), 45000)
  const walletBurst = ratePerSec(w5.uniqueWallets, 5000) / Math.max(0.05, prevWalletRate)

  const prevTradeRate = ratePerSec(Math.max(0, w60.tradeCount - w15.tradeCount), 45000)
  const tradeBurst = ratePerSec(w5.tradeCount, 5000) / Math.max(0.1, prevTradeRate)

  const ignitionScore = clamp01(
    (Math.min(3, volumeBurst) / 3) * 0.4 +
      (Math.min(3, walletBurst) / 3) * 0.35 +
      (Math.min(3, tradeBurst) / 3) * 0.25,
  )

  return {
    volumeBurstScore: clamp01(Math.min(1, volumeBurst / 4)),
    walletBurstScore: clamp01(Math.min(1, walletBurst / 4)),
    tradeBurstScore: clamp01(Math.min(1, tradeBurst / 4)),
    ignitionScore,
  }
}

export function computeMigrationProbability(
  w5: WindowMetrics,
  w15: WindowMetrics,
  velocity: VelocityMetrics,
  burst: BurstMetrics,
  bondingCurvePercent: number,
): MigrationProbability {
  const drivers: string[] = []
  let score = 0

  const curveFactor = clamp01((bondingCurvePercent - 45) / 40)
  score += curveFactor * 0.2
  if (curveFactor > 0.3) drivers.push('curve_approaching_grad')

  const velBoost = clamp01(velocity.volumeVelocity * 2 + velocity.walletVelocity * 3)
  score += velBoost * 0.25
  if (velBoost > 0.4) drivers.push('velocity_surge')

  const accelBoost = clamp01(velocity.volumeAcceleration * 3 + velocity.walletAcceleration * 4)
  score += accelBoost * 0.15
  if (accelBoost > 0.35) drivers.push('acceleration')

  score += burst.ignitionScore * 0.2
  if (burst.ignitionScore > 0.5) drivers.push('burst_ignition')

  const liqGrowth =
    w15.liquidityEnd > w15.liquidityStart && w15.liquidityStart > 0
      ? (w15.liquidityEnd - w15.liquidityStart) / w15.liquidityStart
      : 0
  const liqBoost = clamp01(liqGrowth * 5)
  score += liqBoost * 0.1
  if (liqBoost > 0.3) drivers.push('liquidity_growth')

  const buyBoost = clamp01((w5.buyPressure - 0.5) * 2)
  score += buyBoost * 0.1
  if (buyBoost > 0.35) drivers.push('buy_pressure')

  const holderBoost = clamp01(w15.uniqueWallets / 25)
  score += holderBoost * 0.1
  if (holderBoost > 0.35) drivers.push('wallet_expansion')

  const probability = clamp01(score)
  const confidence = clamp01(
    w5.tradeCount >= 3 && w15.tradeCount >= 6 ? 0.5 + burst.ignitionScore * 0.5 : w5.tradeCount * 0.08,
  )

  return { probability, confidence, drivers }
}

export function applyScoreDecay(
  rawScore: number,
  lastTradeAt: number,
  velocity: VelocityMetrics,
  w5: WindowMetrics,
  now: number,
): { decayedScore: number; decayFactor: number; inactivityMs: number } {
  const inactivityMs = Math.max(0, now - lastTradeAt)
  const inactiveDecay = Math.exp(-inactivityMs / 90_000)
  const velFactor = clamp01(0.35 + velocity.volumeVelocity * 0.35 + velocity.tradeVelocity * 0.3)
  const pressureFactor = clamp01(0.4 + (w5.buyPressure - 0.5))
  const decayFactor = inactiveDecay * velFactor * pressureFactor
  return {
    decayedScore: rawScore * decayFactor,
    decayFactor,
    inactivityMs,
  }
}

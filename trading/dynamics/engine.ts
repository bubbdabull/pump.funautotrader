import { clamp01 } from '../utils/math'
import { TimeBucketRing } from './timeBuckets'
import {
  applyScoreDecay,
  buildWindowMetrics,
  computeBurst,
  computeMigrationProbability,
  computeVelocity,
} from './metrics'
import { transitionLifecycle, initialLifecycleState, lifecycleScoreBoost } from './lifecycle'
import type {
  DynamicsAnalytics,
  DynamicsTradeInput,
  DynamicsWindowKey,
  TokenLifecycleState,
} from './types'
import { DYNAMICS_WINDOWS } from './types'

export interface MintDynamicsState {
  mint: string
  ring: TimeBucketRing
  lifecycle: TokenLifecycleState
  lastTradeAt: number
  bondingCurvePercent: number
  holderEstimate: number
  coordinationPenalty: number
  coordinationFlags: string[]
}

export function createMintDynamics(mint: string): MintDynamicsState {
  return {
    mint,
    ring: new TimeBucketRing(),
    lifecycle: initialLifecycleState(),
    lastTradeAt: 0,
    bondingCurvePercent: 0,
    holderEstimate: 1,
    coordinationPenalty: 0,
    coordinationFlags: [],
  }
}

export function ingestDynamicsTrade(
  state: MintDynamicsState,
  trade: DynamicsTradeInput,
  coordinationPenalty: number,
  coordinationFlags: string[],
): DynamicsAnalytics {
  state.ring.ingest(trade)
  state.lastTradeAt = trade.timestampMs
  if (trade.bondingCurvePercent != null) {
    state.bondingCurvePercent = trade.bondingCurvePercent
  }
  state.coordinationPenalty = coordinationPenalty
  state.coordinationFlags = coordinationFlags
  if (trade.side === 'buy' && trade.wallet !== 'unknown') {
    state.holderEstimate = Math.max(state.holderEstimate, state.ring.aggregate(60_000, trade.timestampMs).uniqueWallets)
  }
  return computeDynamicsAnalytics(state, false)
}

export function computeDynamicsAnalytics(
  state: MintDynamicsState,
  rugBlocked: boolean,
  now = Date.now(),
): DynamicsAnalytics {
  const windows = {} as Record<DynamicsWindowKey, ReturnType<typeof buildWindowMetrics>>
  for (const key of Object.keys(DYNAMICS_WINDOWS) as DynamicsWindowKey[]) {
    windows[key] = buildWindowMetrics(state.ring, key, now)
  }

  const w5 = windows.w5
  const w15 = windows.w15
  const w30 = windows.w30
  const w60 = windows.w60

  const velocity = computeVelocity(w5, w15, w30, w60)
  const burst = computeBurst(w5, w15, w30, w60)
  const migration = computeMigrationProbability(
    w5,
    w15,
    velocity,
    burst,
    state.bondingCurvePercent,
  )

  const lifecycleCtx = transitionLifecycle({
    state: state.lifecycle,
    bondingCurvePercent: state.bondingCurvePercent,
    w5,
    w15,
    velocity,
    burst,
    coordinationPenalty: state.coordinationPenalty,
    rugBlocked,
    lastTradeAt: state.lastTradeAt || now,
    now,
  })
  state.lifecycle = lifecycleCtx.next

  const organicGrowth = clamp01(
    w15.uniqueWallets / 20 +
      w5.buyPressure * 0.35 +
      (1 - state.coordinationPenalty) * 0.35,
  )

  const rawMomentum = clamp01(
    burst.ignitionScore * 0.35 +
      clamp01(velocity.volumeVelocity * 3) * 0.2 +
      clamp01(velocity.walletVelocity * 4) * 0.2 +
      organicGrowth * 0.15 +
      migration.probability * 0.1,
  )

  const { decayedScore, decayFactor } = applyScoreDecay(
    rawMomentum,
    state.lastTradeAt || now,
    velocity,
    w5,
    now,
  )

  const lifecycleBoost = lifecycleScoreBoost(state.lifecycle)
  const tradeConfidenceScore = clamp01(
    decayedScore * (1 - state.coordinationPenalty * 0.85) * decayFactor +
      lifecycleBoost -
      (rugBlocked ? 0.5 : 0),
  )

  return {
    mint: state.mint,
    updatedAt: now,
    windows,
    velocity,
    burst,
    migration,
    lifecycle: state.lifecycle,
    coordinationPenalty: state.coordinationPenalty,
    decayedMomentumScore: decayedScore,
    tradeConfidenceScore,
    buyPressure1m: w60.buyPressure,
    holderEstimate: Math.max(state.holderEstimate, w60.uniqueWallets),
  }
}

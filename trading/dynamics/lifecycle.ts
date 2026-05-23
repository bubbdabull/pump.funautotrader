import type { BurstMetrics, TokenLifecycleState, VelocityMetrics, WindowMetrics } from './types'

export interface LifecycleContext {
  state: TokenLifecycleState
  bondingCurvePercent: number
  w5: WindowMetrics
  w15: WindowMetrics
  velocity: VelocityMetrics
  burst: BurstMetrics
  coordinationPenalty: number
  rugBlocked: boolean
  lastTradeAt: number
  now: number
}

export function initialLifecycleState(): TokenLifecycleState {
  return 'NEW'
}

export function transitionLifecycle(ctx: LifecycleContext): {
  next: TokenLifecycleState
  reason: string
} {
  const { state, bondingCurvePercent, w5, w15, velocity, burst, coordinationPenalty, rugBlocked, lastTradeAt, now } =
    ctx

  if (rugBlocked || coordinationPenalty > 0.65) {
    return { next: 'RUGGED', reason: 'risk_blocked' }
  }

  const inactiveMs = now - lastTradeAt
  if (inactiveMs > 600_000 && w5.tradeCount === 0) {
    return { next: 'DEAD', reason: 'inactivity' }
  }

  if (bondingCurvePercent >= 99) {
    return { next: 'MIGRATED', reason: 'curve_complete' }
  }

  const organic =
    w15.uniqueWallets >= 4 &&
    w5.buyPressure >= 0.52 &&
    coordinationPenalty < 0.35 &&
    w5.tradeCount >= 2

  const momentum =
    organic &&
    (velocity.volumeVelocity > 0.02 || velocity.tradeVelocity > 0.15) &&
    burst.ignitionScore > 0.25

  const breakout =
    momentum &&
    (burst.ignitionScore > 0.55 || velocity.volumeAcceleration > 0.05) &&
    w5.uniqueWallets >= 3

  const migrationWatch =
    breakout &&
    bondingCurvePercent >= 62 &&
    (velocity.marketCapVelocity > 0.01 || bondingCurvePercent >= 72)

  switch (state) {
    case 'NEW':
      if (w5.tradeCount >= 1) return { next: 'DISCOVERING', reason: 'first_trades' }
      return { next: 'NEW', reason: 'awaiting_trades' }

    case 'DISCOVERING':
      if (momentum) return { next: 'MOMENTUM', reason: 'momentum_detected' }
      if (inactiveMs > 300_000 && w15.tradeCount < 2) return { next: 'DEAD', reason: 'no_momentum' }
      return { next: 'DISCOVERING', reason: 'building' }

    case 'MOMENTUM':
      if (breakout) return { next: 'BREAKOUT', reason: 'breakout_burst' }
      if (w5.tradeCount === 0 && inactiveMs > 120_000) return { next: 'DISCOVERING', reason: 'momentum_fade' }
      return { next: 'MOMENTUM', reason: 'momentum_hold' }

    case 'BREAKOUT':
      if (migrationWatch) return { next: 'MIGRATION_WATCH', reason: 'pre_migration' }
      if (burst.ignitionScore < 0.2 && inactiveMs > 90_000) return { next: 'MOMENTUM', reason: 'breakout_cool' }
      return { next: 'BREAKOUT', reason: 'breakout_active' }

    case 'MIGRATION_WATCH':
      if (bondingCurvePercent >= 95) return { next: 'MIGRATED', reason: 'graduated' }
      if (bondingCurvePercent < 55 && inactiveMs > 60_000) return { next: 'MOMENTUM', reason: 'migration_stall' }
      return { next: 'MIGRATION_WATCH', reason: 'watching_grad' }

    case 'MIGRATED':
    case 'DEAD':
    case 'RUGGED':
      return { next: state, reason: 'terminal' }

    default:
      return { next: 'DISCOVERING', reason: 'default' }
  }
}

export function lifecycleScoreBoost(state: TokenLifecycleState): number {
  switch (state) {
    case 'BREAKOUT':
      return 0.18
    case 'MOMENTUM':
      return 0.12
    case 'MIGRATION_WATCH':
      return 0.15
    case 'DISCOVERING':
      return 0.05
    default:
      return 0
  }
}

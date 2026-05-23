/** Rolling window horizons (ms). */
export const DYNAMICS_WINDOWS = {
  w5: 5_000,
  w15: 15_000,
  w30: 30_000,
  w60: 60_000,
} as const

export type DynamicsWindowKey = keyof typeof DYNAMICS_WINDOWS

export interface WindowMetrics {
  volumeSol: number
  buyVol: number
  sellVol: number
  buys: number
  sells: number
  tradeCount: number
  uniqueWallets: number
  liquidityStart: number
  liquidityEnd: number
  mcapStart: number
  mcapEnd: number
  buyPressure: number
}

export interface VelocityMetrics {
  volumeVelocity: number
  walletVelocity: number
  tradeVelocity: number
  marketCapVelocity: number
  volumeAcceleration: number
  walletAcceleration: number
  tradeAcceleration: number
}

export interface BurstMetrics {
  tradeBurstScore: number
  walletBurstScore: number
  volumeBurstScore: number
  ignitionScore: number
}

export interface ScoreDecayState {
  rawScore: number
  decayedScore: number
  inactivityMs: number
  decayFactor: number
}

export interface MigrationProbability {
  probability: number
  confidence: number
  drivers: string[]
}

export type TokenLifecycleState =
  | 'NEW'
  | 'DISCOVERING'
  | 'MOMENTUM'
  | 'BREAKOUT'
  | 'MIGRATION_WATCH'
  | 'MIGRATED'
  | 'DEAD'
  | 'RUGGED'

export interface EventCursor {
  lastSlot: number
  lastTimestamp: number
  sequenceId: number
  lastSignature?: string
}

export interface DynamicsTradeInput {
  signature: string
  wallet: string
  side: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  timestampMs: number
  slot?: number
  sequenceId: number
  marketCapUsd?: number
  liquiditySol?: number
  bondingCurvePercent?: number
}

export interface DynamicsAnalytics {
  mint: string
  updatedAt: number
  windows: Record<DynamicsWindowKey, WindowMetrics>
  velocity: VelocityMetrics
  burst: BurstMetrics
  migration: MigrationProbability
  lifecycle: TokenLifecycleState
  coordinationPenalty: number
  decayedMomentumScore: number
  tradeConfidenceScore: number
  buyPressure1m: number
  holderEstimate: number
}

export interface SignalAttributionRecord {
  id: string
  mint: string
  timestampMs: number
  tradeConfidenceScore: number
  momentumScore: number
  migrationProbability: number
  velocity: VelocityMetrics
  burst: BurstMetrics
  coordinationPenalty: number
  walletGrowth: number
  riskPenalties: string[]
  triggerReasons: string[]
  lifecycle: TokenLifecycleState
  outcome?: 'win' | 'loss' | 'flat' | 'pending'
}

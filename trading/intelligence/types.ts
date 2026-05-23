import type { DynamicsAnalytics } from '../dynamics/types'

export type SignalState =
  | 'RAW_SIGNAL'
  | 'ACCUMULATION_SIGNAL'
  | 'MOMENTUM_SIGNAL'
  | 'DISTRIBUTION_SIGNAL'
  | 'INVALID_SIGNAL'

export type PumpDetectionLabel =
  | 'EARLY_BREAKOUT'
  | 'ACCUMULATION_PHASE'
  | 'FAKEOUT_RISK'
  | 'NO_SIGNAL'

export type SmartMoneyFlow = 'SMART_MONEY_IN' | 'SMART_MONEY_EXIT' | 'NEUTRAL'

export type SubscriptionTier = 'free' | 'pro'

export interface TokenIntelligence {
  signalState: SignalState
  /** Unified intelligence score 0–100 — always defined for non-invalid tokens */
  score: number
  confidenceScore: number
  dataCompletenessScore: number
  smartMoneyScore: number
  smartMoneyFlow: SmartMoneyFlow
  pumpProbabilityScore: number
  pumpSignal: PumpDetectionLabel
  /** Score delta vs previous tick */
  scoreVelocity: number
}

export interface IntelligenceInput {
  mint: string
  symbol?: string
  name?: string
  marketCap: number
  bondingCurvePercent: number
  holders: number
  holdersVerified?: boolean
  volume24h: number
  liquidity?: number
  signalScore?: number
  aiRiskScore?: number
  momentumScore?: number
  lastTradeAt?: number
  isActive?: boolean
  trades1m?: number
  volume5mSol?: number
  buyPressure1m?: number
  mcapChange5m?: number
  launchedAt?: string | number
  top1Pct?: number
  top5Pct?: number
  migrationProbability?: number
  burstIgnition?: number
  lifecycle?: string
  analytics?: DynamicsAnalytics | null
  priorScore?: number
  smartMoneySms?: number
  smartMoneyDivergence?: number
}

export type IntelligenceAlertType =
  | 'pump_probability'
  | 'smart_money_in'
  | 'volume_spike'
  | 'migration'

export interface IntelligenceAlert {
  type: IntelligenceAlertType
  mint: string
  score: number
  pumpProbabilityScore: number
  smartMoneyFlow: SmartMoneyFlow
  pumpSignal: PumpDetectionLabel
  at: number
}

import type {
  DynamicsAnalytics,
  SignalAttributionRecord,
  TokenLifecycleState,
  WalletRelationshipGraph,
} from '@phronis/trading'
import type { OnChainHolderSnapshot } from '@phronis/trading'
import type { RugScoreBreakdown } from '@phronis/trading'

export interface TokenStateChangePayload {
  mint: string
  from: TokenLifecycleState
  to: TokenLifecycleState
  at: string
}

export interface MigrationUpdatePayload {
  mint: string
  probability: number
  confidence: number
  bondingCurvePercent: number
  lifecycle: TokenLifecycleState
  drivers: string[]
  at: string
}

export interface SignalUpdatePayload {
  mint: string
  tradeConfidenceScore: number
  momentumScore: number
  migrationProbability: number
  burstIgnition: number
  coordinationPenalty: number
  lifecycle: TokenLifecycleState
  velocity: DynamicsAnalytics['velocity']
  burst: DynamicsAnalytics['burst']
  riskPenalties: string[]
  triggerReasons: string[]
  rug: Pick<RugScoreBreakdown, 'rugScore' | 'blocked' | 'fakeVolumeProbability'>
  at: string
}

export interface HolderUpdatePayload {
  mint: string
  holders: number
  holdersVerified: boolean
  top1Pct: number
  top5Pct: number
  entropy: number
  suspiciousClusterPct?: number
  at: string
}

export interface BubbleMapUpdatePayload {
  mint: string
  graph: WalletRelationshipGraph
  snapshot?: OnChainHolderSnapshot
  at: string
}

export interface WalletUpdatePayload {
  mint: string
  graph: WalletRelationshipGraph
  at: string
}

export interface ProgressionPoint {
  t: number
  mcap: number
  curve: number
  volume: number
  holders: number
  score: number
  momentum: number
  migrationProbability: number
  burstIgnition: number
  buyPressure: number
  volumeVelocity: number
  walletVelocity: number
  momentumPulse?: boolean
}

export interface ChartProgressionPayload {
  mint: string
  points: ProgressionPoint[]
  at: string
}

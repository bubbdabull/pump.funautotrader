import type { TokenLifecycleState, WalletRelationshipGraph } from '@trading'
import type { RugScoreBreakdown } from '@/lib/quantTypes'

export type { TokenLifecycleState, WalletRelationshipGraph }

export interface TokenDynamics {
  lifecycle: TokenLifecycleState
  migrationProbability: number
  burstIgnition: number
  volumeVelocity: number
  walletVelocity: number
  tradeVelocity: number
  volumeAcceleration: number
  walletAcceleration: number
  coordinationPenalty: number
  buyPressure: number
  top1Pct?: number
  top5Pct?: number
  bundleProbability?: number
  sniperProbability?: number
  rugScore?: number
}

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
  velocity: {
    volumeVelocity: number
    walletVelocity: number
    tradeVelocity: number
    marketCapVelocity: number
    volumeAcceleration: number
    walletAcceleration: number
    tradeAcceleration: number
  }
  burst: {
    tradeBurstScore: number
    walletBurstScore: number
    volumeBurstScore: number
    ignitionScore: number
  }
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
  at: string
}

export interface WalletUpdatePayload {
  mint: string
  graph: WalletRelationshipGraph
  at: string
}

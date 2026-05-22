export interface QuantitativeScores {
  momentumScore: number
  liquidityScore: number
  buyPressureScore: number
  volatilityScore: number
  holderQualityScore: number
  whaleConfidenceScore: number
  rugProbabilityScore: number
  tradeConfidenceScore: number
  vwap: number
  ema: number
  volumeDelta: number
  orderFlowImbalance: number
  priceVelocity: number
  liquidityGrowth: number
  tradeVelocity: number
  sharpeLike: number
}

export interface RugScoreBreakdown {
  rugScore: number
  creatorRisk: number
  holderConcentration: number
  liquidityWeakness: number
  suspiciousWallets: number
  fakeVolumeProbability: number
  blocked: boolean
  reasons: string[]
}

export type StrategyId =
  | 'early_momentum'
  | 'liquidity_expansion'
  | 'migration'
  | 'smart_money_follow'
  | 'mean_reversion_scalp'

export interface StrategySignal {
  strategyId: StrategyId
  mint: string
  side: 'buy' | 'sell'
  confidence: number
  reasons: string[]
  scores: QuantitativeScores
  rug: RugScoreBreakdown
  timestamp: number
}

export interface QuantUpdate {
  mint: string
  scores: QuantitativeScores
  rug: RugScoreBreakdown
  strategies: StrategySignal[]
  risk: { allowed: boolean; reason?: string }
  holders?: number
  holdersVerified?: boolean
  at: string
}

export interface QuantRanking {
  mint: string
  confidence: number
}

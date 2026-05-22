import type { QuantitativeScores } from '../quantitative/scores'
import type { RugScoreBreakdown } from '../rug/rugScoreEngine'
import type { TokenMarketState } from '../types'

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

export interface StrategyContext {
  state: TokenMarketState
  scores: QuantitativeScores
  rug: RugScoreBreakdown
}

export interface DeterministicStrategy {
  id: StrategyId
  name: string
  evaluate(ctx: StrategyContext): StrategySignal | null
}

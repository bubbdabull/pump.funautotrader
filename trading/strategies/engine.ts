import { computeQuantitativeScores } from '../quantitative/scores'
import { computeRugScore } from '../rug/rugScoreEngine'
import type { TokenMarketState } from '../types'
import { earlyMomentumStrategy } from './earlyMomentum'
import { liquidityExpansionStrategy } from './liquidityExpansion'
import { meanReversionScalpStrategy } from './meanReversion'
import { migrationStrategy } from './migration'
import { smartMoneyFollowStrategy } from './smartMoneyFollow'
import type { DeterministicStrategy, StrategyContext, StrategySignal } from './types'

export const ALL_STRATEGIES: DeterministicStrategy[] = [
  earlyMomentumStrategy,
  liquidityExpansionStrategy,
  migrationStrategy,
  smartMoneyFollowStrategy,
  meanReversionScalpStrategy,
]

export function buildStrategyContext(state: TokenMarketState): StrategyContext {
  const scores = computeQuantitativeScores(state)
  const rug = computeRugScore(state)
  return { state, scores, rug }
}

export function evaluateAllStrategies(state: TokenMarketState): StrategySignal[] {
  const ctx = buildStrategyContext(state)
  if (ctx.rug.blocked) return []

  const signals: StrategySignal[] = []
  for (const strategy of ALL_STRATEGIES) {
    const sig = strategy.evaluate(ctx)
    if (sig && sig.confidence >= 0.55) signals.push(sig)
  }
  return signals.sort((a, b) => b.confidence - a.confidence)
}

export function bestStrategySignal(state: TokenMarketState): StrategySignal | null {
  const all = evaluateAllStrategies(state)
  return all[0] ?? null
}

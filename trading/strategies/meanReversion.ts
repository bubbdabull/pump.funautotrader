import { orderFlowImbalance, realizedVolatility } from '../quantitative/indicators'
import { clamp01 } from '../utils/math'
import type { DeterministicStrategy, StrategyContext, StrategySignal } from './types'

export const meanReversionScalpStrategy: DeterministicStrategy = {
  id: 'mean_reversion_scalp',
  name: 'Mean Reversion Scalp',

  evaluate(ctx: StrategyContext): StrategySignal | null {
    const { state, scores, rug } = ctx
    if (rug.blocked) return null

    const prices = state.trades
      .filter((t) => t.tokenAmount > 0)
      .map((t) => t.solAmount / t.tokenAmount)
    if (prices.length < 6) return null

    const vol = realizedVolatility(prices.slice(-12))
    const ofi = orderFlowImbalance(state.trades, 45_000)
    const last = prices[prices.length - 1]
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length
    const oversold = last < mean * 0.92

    if (vol < 0.02) return null
    if (!oversold) return null
    if (scores.liquidityScore < 0.45) return null
    if (ofi < 0.15) return null

    const confidence = clamp01(scores.volatilityScore * 0.3 + clamp01((ofi + 1) / 2) * 0.4 + 0.3)

    return {
      strategyId: 'mean_reversion_scalp',
      mint: state.mint,
      side: 'buy',
      confidence,
      reasons: ['volatility_spike', 'oversold', 'buy_imbalance_return'],
      scores,
      rug,
      timestamp: Date.now(),
    }
  },
}

import { buyPressurePct, liquidityGrowth, uniqueBuyerGrowth } from '../quantitative/indicators'
import { clamp01 } from '../utils/math'
import type { DeterministicStrategy, StrategyContext, StrategySignal } from './types'

export const earlyMomentumStrategy: DeterministicStrategy = {
  id: 'early_momentum',
  name: 'Early Momentum',

  evaluate(ctx: StrategyContext): StrategySignal | null {
    const { state, scores, rug } = ctx
    if (rug.blocked) return null

    const buyPct = buyPressurePct(state.trades)
    const liqG = liquidityGrowth(state)
    const holderG = uniqueBuyerGrowth(state)
    const whaleBuying = scores.whaleConfidenceScore > 0.45

    if (buyPct < 0.7) return null
    if (liqG < 0.08) return null
    if (holderG < 0.05 && state.trades.length > 5) return null
    if (scores.momentumScore < 0.55) return null
    if (!whaleBuying && scores.buyPressureScore < 0.65) return null

    const confidence = clamp01(
      scores.momentumScore * 0.35 + buyPct * 0.25 + scores.tradeConfidenceScore * 0.4,
    )

    return {
      strategyId: 'early_momentum',
      mint: state.mint,
      side: 'buy',
      confidence,
      reasons: ['buy_pressure_70', 'liquidity_growth', 'holder_growth', 'momentum_positive'],
      scores,
      rug,
      timestamp: Date.now(),
    }
  },
}

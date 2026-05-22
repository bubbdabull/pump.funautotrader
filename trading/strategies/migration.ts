import { buyPressurePct, tradeVelocity } from '../quantitative/indicators'
import { GRADUATING_CURVE_MIN } from '../utils/feedQuality'
import { clamp01 } from '../utils/math'
import type { DeterministicStrategy, StrategyContext, StrategySignal } from './types'

export const migrationStrategy: DeterministicStrategy = {
  id: 'migration',
  name: 'Migration',

  evaluate(ctx: StrategyContext): StrategySignal | null {
    const { state, scores, rug } = ctx
    if (rug.blocked) return null

    const curve = state.bondingCurvePercent
    if (curve < GRADUATING_CURVE_MIN) return null

    const buyPct = buyPressurePct(state.trades)
    const tVel = tradeVelocity(state.trades)

    if (buyPct < 0.55) return null
    if (tVel < 0.3) return null
    if (scores.liquidityScore < 0.5) return null

    const confidence = clamp01(
      (curve / 100) * 0.3 + buyPct * 0.3 + clamp01(tVel / 2) * 0.2 + scores.tradeConfidenceScore * 0.2,
    )

    return {
      strategyId: 'migration',
      mint: state.mint,
      side: 'buy',
      confidence,
      reasons: ['curve_near_completion', 'tx_frequency_up', 'buy_pressure_sustained'],
      scores,
      rug,
      timestamp: Date.now(),
    }
  },
}

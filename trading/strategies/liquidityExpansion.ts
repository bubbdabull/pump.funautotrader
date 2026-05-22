import { liquidityGrowth, orderFlowImbalance } from '../quantitative/indicators'
import { clamp01 } from '../utils/math'
import type { DeterministicStrategy, StrategyContext, StrategySignal } from './types'

export const liquidityExpansionStrategy: DeterministicStrategy = {
  id: 'liquidity_expansion',
  name: 'Liquidity Expansion',

  evaluate(ctx: StrategyContext): StrategySignal | null {
    const { state, scores, rug } = ctx
    if (rug.blocked) return null

    const liqG = liquidityGrowth(state)
    const ofi = orderFlowImbalance(state.trades)
    const creatorInactive =
      !state.deployerWallet ||
      (state.walletBuySol.get(state.deployerWallet) ?? 0) < 0.5

    if (liqG < 0.15) return null
    if (scores.liquidityScore < 0.6) return null
    if (ofi < 0.1) return null
    if (rug.holderConcentration > 0.65) return null
    if (!creatorInactive) return null

    const confidence = clamp01(scores.liquidityScore * 0.5 + clamp01(liqG * 2) * 0.5)

    return {
      strategyId: 'liquidity_expansion',
      mint: state.mint,
      side: 'buy',
      confidence,
      reasons: ['liquidity_spike', 'volume_supports_price', 'creator_inactive'],
      scores,
      rug,
      timestamp: Date.now(),
    }
  },
}

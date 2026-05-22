import { globalWalletTracker } from '../smartMoney/walletTracker'
import { clamp01 } from '../utils/math'
import type { DeterministicStrategy, StrategyContext, StrategySignal } from './types'

export const smartMoneyFollowStrategy: DeterministicStrategy = {
  id: 'smart_money_follow',
  name: 'Smart Money Follow',

  evaluate(ctx: StrategyContext): StrategySignal | null {
    const { state, scores, rug } = ctx
    if (rug.blocked) return null

    const recent = state.trades.slice(-25)
    let smartBuy = 0
    for (const t of recent) {
      if (t.side !== 'buy') continue
      if (!globalWalletTracker.isSmartMoney(t.wallet)) continue
      const perf = globalWalletTracker.getPerformance(t.wallet)
      if (perf && perf.roi >= 1.2) smartBuy += t.solAmount
    }

    if (smartBuy < 0.3) return null
    if (scores.holderQualityScore < 0.4) return null
    if (rug.holderConcentration > 0.7) return null
    if (scores.buyPressureScore < 0.5) return null

    const confidence = clamp01(scores.whaleConfidenceScore * 0.5 + clamp01(smartBuy / 3) * 0.5)

    return {
      strategyId: 'smart_money_follow',
      mint: state.mint,
      side: 'buy',
      confidence,
      reasons: ['smart_wallet_buy', 'organic_volume', 'holder_growth_ok'],
      scores,
      rug,
      timestamp: Date.now(),
    }
  },
}

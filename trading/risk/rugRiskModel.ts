import { ENTRY_RRM_MAX } from '../constants'
import type { TokenMarketState } from '../types'
import { clamp01 } from '../utils/math'

export interface RugRiskModelResult {
  rrm: number
  devOwnershipRisk: number
  deployerHistoryRisk: number
  liquidityFragilityRisk: number
  holderConcentrationRisk: number
  abnormalSellPressure: number
  blocked: boolean
}

export function computeRRM(
  state: TokenMarketState,
  lsi: number,
  deployerRugRate = 0,
): RugRiskModelResult {
  const balances = [...state.walletBalances.values()]
  const totalTokens = balances.reduce((a, b) => a + Math.max(0, b), 0)

  let devOwnershipRisk = 0.2
  if (state.deployerWallet && totalTokens > 0) {
    const devBal = Math.max(0, state.walletBalances.get(state.deployerWallet) ?? 0)
    devOwnershipRisk = clamp01(devBal / totalTokens)
  }

  const deployerHistoryRisk = clamp01(deployerRugRate)

  const liquidityFragilityRisk = clamp01(1 - lsi)

  let holderConcentrationRisk = 0.25
  const chain = state.onChainHolders
  if (chain && chain.top1Pct > 0) {
    const topShare = chain.top1Pct
    const top5Share = chain.top5Pct
    holderConcentrationRisk = clamp01(topShare * 1.2 + top5Share * 0.5)
    if (topShare > 0.1) {
      holderConcentrationRisk = clamp01(
        holderConcentrationRisk + Math.exp((topShare - 0.1) * 8) * 0.05,
      )
    }
    if (top5Share > 0.4) {
      holderConcentrationRisk = clamp01(holderConcentrationRisk + 0.25)
    }
    if (chain.suspiciousClusterPct && chain.suspiciousClusterPct > 0.35) {
      holderConcentrationRisk = clamp01(holderConcentrationRisk + chain.suspiciousClusterPct * 0.2)
    }
  } else if (totalTokens > 0) {
    const sorted = balances
      .filter((b) => b > 0)
      .sort((a, b) => b - a)
    const top = sorted[0] ?? 0
    const top5 = sorted.slice(0, 5).reduce((a, b) => a + b, 0)
    const topShare = top / totalTokens
    const top5Share = top5 / totalTokens
    holderConcentrationRisk = clamp01(topShare * 1.2 + top5Share * 0.5)
    if (topShare > 0.1) {
      holderConcentrationRisk = clamp01(
        holderConcentrationRisk + Math.exp((topShare - 0.1) * 8) * 0.05,
      )
    }
    if (top5Share > 0.4) {
      holderConcentrationRisk = clamp01(holderConcentrationRisk + 0.25)
    }
  }

  const recent = state.trades.slice(-15)
  const buySol = recent.filter((t) => t.side === 'buy').reduce((a, t) => a + t.solAmount, 0)
  const sellSol = recent.filter((t) => t.side === 'sell').reduce((a, t) => a + t.solAmount, 0)
  const total = buySol + sellSol
  const abnormalSellPressure =
    total > 0 ? clamp01(Math.max(0, sellSol / total - 0.45) * 2.2) : 0

  const rrm = clamp01(
    devOwnershipRisk * 0.25 +
      deployerHistoryRisk * 0.15 +
      liquidityFragilityRisk * 0.25 +
      holderConcentrationRisk * 0.25 +
      abnormalSellPressure * 0.1,
  )

  return {
    rrm,
    devOwnershipRisk,
    deployerHistoryRisk,
    liquidityFragilityRisk,
    holderConcentrationRisk,
    abnormalSellPressure,
    blocked: rrm > ENTRY_RRM_MAX,
  }
}

import { THIN_LIQUIDITY_SOL, LIQUIDITY_SPIKE_RATIO } from '../constants'
import type { TokenMarketState } from '../types'
import { clamp01, coefficientOfVariation, linearRegressionSlope } from '../utils/math'

export interface LiquidityModelResult {
  lsi: number
  liquidityGrowthRate: number
  buyPressureConsistency: number
  depthStability: number
  penalties: string[]
}

export function computeLSI(state: TokenMarketState): LiquidityModelResult {
  const penalties: string[] = []
  const history = state.liquidityHistory
  const solLevels = history.map((h) => h.virtualSolReserves)

  let liquidityGrowthRate = 0.5
  if (solLevels.length >= 3) {
    const points = solLevels.map((y, i) => ({ x: i, y }))
    const slope = linearRegressionSlope(points)
    liquidityGrowthRate = clamp01(0.5 + slope / Math.max(1, solLevels[solLevels.length - 1] * 0.1))
  }

  const trades = state.trades
  let buyPressureConsistency = 0.5
  if (trades.length >= 4) {
    const recent = trades.slice(-20)
    const buyVol = recent.filter((t) => t.side === 'buy').reduce((a, t) => a + t.solAmount, 0)
    const sellVol = recent.filter((t) => t.side === 'sell').reduce((a, t) => a + t.solAmount, 0)
    const total = buyVol + sellVol
    if (total > 0) {
      const buyShare = buyVol / total
      buyPressureConsistency = clamp01(1 - Math.abs(buyShare - 0.55) * 2)
    }
  }

  let depthStability = 0.5
  if (solLevels.length >= 3) {
    const cv = coefficientOfVariation(solLevels)
    depthStability = clamp01(1 - cv)
  }

  let lsi =
    liquidityGrowthRate * 0.4 + buyPressureConsistency * 0.3 + depthStability * 0.3

  const latestSol = solLevels[solLevels.length - 1] ?? state.liquidity
  if (latestSol < THIN_LIQUIDITY_SOL) {
    lsi *= 0.35
    penalties.push('thin_liquidity')
  }

  if (solLevels.length >= 2) {
    const prev = solLevels[solLevels.length - 2]
    const curr = solLevels[solLevels.length - 1]
    if (prev > 0 && curr / prev > LIQUIDITY_SPIKE_RATIO) {
      lsi *= 0.6
      penalties.push('liquidity_spike')
    }
  }

  if (solLevels.length >= 4 && coefficientOfVariation(solLevels) > 0.45) {
    lsi *= 0.75
    penalties.push('erratic_liquidity')
  }

  return {
    lsi: clamp01(lsi),
    liquidityGrowthRate,
    buyPressureConsistency,
    depthStability,
    penalties,
  }
}

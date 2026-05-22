import type { TokenMarketState } from '../types'
import { computeProbabilisticMetrics } from '../decision/evEngine'
import { computeRugScore } from '../rug/rugScoreEngine'
import { globalWalletTracker } from '../smartMoney/walletTracker'
import { clamp01 } from '../utils/math'
import {
  buyPressurePct,
  computeEmaLast,
  computeVwap,
  liquidityGrowth,
  marketCapAcceleration,
  orderFlowImbalance,
  priceVelocity,
  realizedVolatility,
  sharpeLikeScore,
  tradeReturnsFromTicks,
  tradeVelocity,
  uniqueBuyerGrowth,
  volumeDelta,
} from './indicators'

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

export function computeQuantitativeScores(state: TokenMarketState): QuantitativeScores {
  const trades = state.trades
  const now = Date.now()
  const metrics = computeProbabilisticMetrics(state)
  const rug = computeRugScore(state)

  const prices = trades
    .filter((t) => t.tokenAmount > 0)
    .map((t) => t.solAmount / t.tokenAmount)

  const vwap = computeVwap(trades)
  const emaLast = computeEmaLast(prices, 12)
  const volDelta = volumeDelta(trades, 60_000, now)
  const ofi = orderFlowImbalance(trades, 60_000, now)
  const pVel = priceVelocity(trades, 8)
  const liqG = liquidityGrowth(state)
  const vol = realizedVolatility(prices.slice(-20))
  const returns = tradeReturnsFromTicks(trades)
  const sharpe = sharpeLikeScore(returns)
  const buyPct = buyPressurePct(trades, 60_000, now)
  const tVel = tradeVelocity(trades, 60_000, now)
  const holderGrowth = uniqueBuyerGrowth(state)
  const mcapAccel = marketCapAcceleration(state)

  const momentumScore = clamp01(
    metrics.components.mqi * 0.4 +
      clamp01(pVel * 50 + 0.5) * 0.2 +
      clamp01(mcapAccel * 2 + 0.5) * 0.2 +
      clamp01(tVel / 3) * 0.2,
  )

  const liquidityScore = clamp01(metrics.components.lsi * 0.6 + clamp01(liqG * 3) * 0.4)

  const buyPressureScore = clamp01(buyPct * 0.7 + clamp01((ofi + 1) / 2) * 0.3)

  const volatilityScore = clamp01(1 - Math.min(1, vol * 8))

  const holderQualityScore = clamp01(
    metrics.components.hdi * 0.5 + clamp01(holderGrowth) * 0.5,
  )

  let whaleSol = 0
  for (const t of trades.slice(-30)) {
    if (t.side === 'buy' && t.solAmount >= 2) whaleSol += t.solAmount
  }
  const whaleConfidenceScore = clamp01(
    metrics.components.sms * 0.6 + clamp01(whaleSol / 10) * 0.4,
  )

  const rugProbabilityScore = rug.rugScore

  const tradeConfidenceScore = clamp01(
    metrics.evScore * 0.45 +
      momentumScore * 0.2 +
      buyPressureScore * 0.15 +
      (1 - rugProbabilityScore) * 0.2,
  )

  void globalWalletTracker

  return {
    momentumScore,
    liquidityScore,
    buyPressureScore,
    volatilityScore,
    holderQualityScore,
    whaleConfidenceScore,
    rugProbabilityScore,
    tradeConfidenceScore,
    vwap,
    ema: emaLast,
    volumeDelta: volDelta,
    orderFlowImbalance: ofi,
    priceVelocity: pVel,
    liquidityGrowth: liqG,
    tradeVelocity: tVel,
    sharpeLike: sharpe,
  }
}

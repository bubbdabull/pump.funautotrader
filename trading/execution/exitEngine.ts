import { EXIT_SCORE_THRESHOLD, EXIT_EV_DETERIORATION } from '../constants'
import { computeProbabilisticMetrics } from '../decision/evEngine'
import { computeMQI } from '../momentum/momentumEngine'
import { computeLSI } from '../risk/liquidityModel'
import { computeSMS, globalWalletTracker } from '../smartMoney/walletTracker'
import type { TokenMarketState, PositionContext, ExitDecision } from '../types'
import { clamp01, coefficientOfVariation } from '../utils/math'

export function evaluateExit(
  state: TokenMarketState,
  position: PositionContext,
): ExitDecision {
  const metrics = computeProbabilisticMetrics(state)
  const mqi = computeMQI(state)
  const lsi = computeLSI(state)
  const sms = computeSMS(state, globalWalletTracker)

  const recent = state.trades.slice(-12)
  const buySol = recent.filter((t) => t.side === 'buy').reduce((a, t) => a + t.solAmount, 0)
  const sellSol = recent.filter((t) => t.side === 'sell').reduce((a, t) => a + t.solAmount, 0)
  const total = buySol + sellSol

  const mcaps = state.liquidityHistory.map((h) => h.marketCapSol)
  let momentumDecayRate = 0
  if (mcaps.length >= 4) {
    const first = mcaps.slice(0, Math.floor(mcaps.length / 2))
    const second = mcaps.slice(Math.floor(mcaps.length / 2))
    const m1 = first.reduce((a, b) => a + b, 0) / first.length
    const m2 = second.reduce((a, b) => a + b, 0) / second.length
    if (m1 > 0 && m2 < m1 * 0.92) momentumDecayRate = clamp01((m1 - m2) / m1)
  }

  const smartMoneyExitSignal = sms.divergence
  const liquidityDropRate = clamp01(1 - lsi.lsi)

  const solSeries = state.liquidityHistory.map((h) => h.virtualSolReserves)
  const volatilitySpike =
    solSeries.length >= 3 ? clamp01(coefficientOfVariation(solSeries) - 0.25) : 0

  const buyPressureCollapse =
    total > 0 ? clamp01(Math.max(0, 0.55 - buySol / total) * 2) : 0.3

  const exitScore = clamp01(
    momentumDecayRate * 0.3 +
      smartMoneyExitSignal * 0.25 +
      liquidityDropRate * 0.2 +
      volatilitySpike * 0.15 +
      buyPressureCollapse * 0.1,
  )

  const evDeterioration =
    position.entryEvScore > 0
      ? (position.entryEvScore - metrics.evScore) / position.entryEvScore
      : 0

  const reasons: string[] = []
  if (exitScore > EXIT_SCORE_THRESHOLD) reasons.push('exit_score')
  if (evDeterioration >= EXIT_EV_DETERIORATION) reasons.push('ev_deterioration')
  if (mqi.mqi < 0.35) reasons.push('momentum_collapse')

  return {
    shouldExit: reasons.length > 0,
    exitScore,
    reasons,
    metrics,
  }
}

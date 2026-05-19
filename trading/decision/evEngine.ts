import {
  ENTRY_EV_MIN,
  ENTRY_LSI_MIN,
  ENTRY_MQI_MIN,
  ENTRY_RRM_MAX,
  ENTRY_SIS_MAX,
  FILTER_HDI_MIN,
  FILTER_MQI_MIN,
} from '../constants'
import { computeLSI } from '../risk/liquidityModel'
import { computeSIS, applySisEvMultiplier } from '../risk/sniperModel'
import { computeRRM } from '../risk/rugRiskModel'
import { computeMQI } from '../momentum/momentumEngine'
import { computeSMS, globalWalletTracker } from '../smartMoney/walletTracker'
import type {
  TokenMarketState,
  ProbabilisticMetrics,
  EntryDecision,
  IndexComponents,
} from '../types'
import { clamp01, normalizedEntropy } from '../utils/math'

export function computeHDI(state: TokenMarketState): number {
  const balances = [...state.walletBalances.values()].filter((b) => b > 0)
  if (balances.length < 2) return 0.35
  return normalizedEntropy(balances)
}

export function computeProbabilisticMetrics(state: TokenMarketState): ProbabilisticMetrics {
  const lsiResult = computeLSI(state)
  const mqiResult = computeMQI(state)
  const hdi = computeHDI(state)
  const smsResult = computeSMS(state, globalWalletTracker)
  const sisResult = computeSIS(state)
  const rrmResult = computeRRM(state, lsiResult.lsi)

  const components: IndexComponents = {
    lsi: lsiResult.lsi,
    mqi: mqiResult.mqi,
    hdi,
    sms: smsResult.sms,
    sis: sisResult.sis,
    rrm: rrmResult.rrm,
  }

  const evScoreRaw =
    0.3 * components.mqi +
    0.2 * components.lsi +
    0.2 * components.hdi +
    0.2 * components.sms -
    0.4 * components.rrm -
    0.3 * components.sis

  let evScore = clamp01((evScoreRaw + 0.35) / 1.35)

  const pWin = clamp01(
    0.15 +
      evScore * 0.55 +
      components.sms * 0.2 -
      components.rrm * 0.25 -
      components.sis * 0.2,
  )
  const avgWin = clamp01(0.08 + components.mqi * 0.25 + components.lsi * 0.1)
  const avgLoss = clamp01(0.12 + components.rrm * 0.35 + components.sis * 0.25)

  let expectedValue = pWin * avgWin - (1 - pWin) * avgLoss
  expectedValue = applySisEvMultiplier(expectedValue, components.sis)

  return {
    components,
    pWin,
    avgWin,
    avgLoss,
    expectedValue,
    evScore,
    evScoreRaw,
  }
}

export function passesTradeQualityFilter(metrics: ProbabilisticMetrics): string[] {
  const fails: string[] = []
  const { mqi, hdi, sis, rrm } = metrics.components
  if (mqi < FILTER_MQI_MIN) fails.push('mqi_below_floor')
  if (hdi < FILTER_HDI_MIN) fails.push('hdi_below_floor')
  if (sis > ENTRY_SIS_MAX) fails.push('sis_toxic')
  if (rrm > ENTRY_RRM_MAX) fails.push('rrm_elevated')
  return fails
}

export function evaluateEntry(state: TokenMarketState): EntryDecision {
  const metrics = computeProbabilisticMetrics(state)
  const { lsi, mqi, sis, rrm } = metrics.components
  const blockReasons: string[] = passesTradeQualityFilter(metrics)

  if (metrics.evScore <= ENTRY_EV_MIN) blockReasons.push('ev_below_threshold')
  if (rrm >= ENTRY_RRM_MAX) blockReasons.push('rrm_blocked')
  if (sis >= ENTRY_SIS_MAX) blockReasons.push('sis_blocked')
  if (lsi <= ENTRY_LSI_MIN) blockReasons.push('lsi_unstable')
  if (mqi <= ENTRY_MQI_MIN) blockReasons.push('mqi_weak')

  const blocked = blockReasons.length > 0
  const allowed = !blocked

  return {
    allowed,
    blocked,
    blockReasons,
    metrics,
    positionSizeSol: 0,
    positionSizePct: 0,
  }
}

/** Map EV quality to legacy UI signal (lower = better entry). */
export function evScoreToSignalScore(metrics: ProbabilisticMetrics): number {
  return Math.round(clamp01(1 - metrics.evScore) * 100)
}

export function momentumScoreFromMetrics(metrics: ProbabilisticMetrics): number {
  return Math.round(metrics.components.mqi * 100)
}

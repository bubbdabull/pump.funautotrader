import {
  BASE_POSITION_SOL,
  MIN_POSITION_PCT,
  MAX_POSITION_PCT,
  ASSUMED_PORTFOLIO_SOL,
} from '../constants'
import type { ProbabilisticMetrics, EntryDecision } from '../types'
import { clamp } from '../utils/math'

export function computePositionSize(
  metrics: ProbabilisticMetrics,
  baseSizeSol = BASE_POSITION_SOL,
  portfolioSol = ASSUMED_PORTFOLIO_SOL,
): Pick<EntryDecision, 'positionSizeSol' | 'positionSizePct'> {
  const edge = Math.max(0, metrics.evScore - 0.5)
  const risk = Math.max(0.05, metrics.components.rrm + metrics.components.sis)

  let pct = (edge / risk) * 0.02
  pct = clamp(pct, MIN_POSITION_PCT, MAX_POSITION_PCT)

  let positionSizeSol = Math.max(baseSizeSol * (edge / 0.22), portfolioSol * pct)
  positionSizeSol = clamp(positionSizeSol, portfolioSol * MIN_POSITION_PCT, portfolioSol * MAX_POSITION_PCT)

  return {
    positionSizeSol: Number(positionSizeSol.toFixed(4)),
    positionSizePct: Number(pct.toFixed(4)),
  }
}

export function finalizeEntryDecision(
  decision: EntryDecision,
  baseSizeSol?: number,
): EntryDecision {
  if (!decision.allowed) return decision
  const sizing = computePositionSize(decision.metrics, baseSizeSol)
  return { ...decision, ...sizing }
}

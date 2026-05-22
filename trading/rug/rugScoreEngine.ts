import type { TokenMarketState } from '../types'
import { computeSIS } from '../risk/sniperModel'
import { computeRRM } from '../risk/rugRiskModel'
import { computeLSI } from '../risk/liquidityModel'
import { clamp01 } from '../utils/math'
import { orderFlowImbalance } from '../quantitative/indicators'

/** R = w1·C + w2·H + w3·L + w4·S + w5·V */
export interface RugScoreBreakdown {
  rugScore: number
  creatorRisk: number
  holderConcentration: number
  liquidityWeakness: number
  suspiciousWallets: number
  fakeVolumeProbability: number
  blocked: boolean
  reasons: string[]
}

const W = {
  creator: 0.28,
  holder: 0.24,
  liquidity: 0.2,
  suspicious: 0.18,
  fakeVolume: 0.1,
} as const

export const RUG_BLOCK_THRESHOLD = 0.72

export function computeRugScore(state: TokenMarketState): RugScoreBreakdown {
  const lsi = computeLSI(state).lsi
  const rrm = computeRRM(state, lsi)
  const sis = computeSIS(state)

  const creatorRisk = rrm.devOwnershipRisk * 0.6 + rrm.deployerHistoryRisk * 0.4

  const holderConcentration = rrm.holderConcentrationRisk

  const liquidityWeakness = clamp01(rrm.liquidityFragilityRisk + (1 - lsi) * 0.3)

  const suspiciousWallets = clamp01(sis.sis * 0.7 + rrm.abnormalSellPressure * 0.3)

  const ofi = orderFlowImbalance(state.trades, 90_000)
  const buySol = state.trades
    .slice(-20)
    .filter((t) => t.side === 'buy')
    .reduce((a, t) => a + t.solAmount, 0)
  const sellSol = state.trades
    .slice(-20)
    .filter((t) => t.side === 'sell')
    .reduce((a, t) => a + t.solAmount, 0)
  let fakeVolumeProbability = 0
  if (buySol > 0 && sellSol < buySol * 0.05 && state.trades.length > 8) {
    fakeVolumeProbability = clamp01(0.35 + sis.sameBlockEntryDensity * 0.1)
  }
  if (Math.abs(ofi) < 0.05 && buySol + sellSol > 3) {
    fakeVolumeProbability = clamp01(fakeVolumeProbability + 0.2)
  }

  const rugScore = clamp01(
    W.creator * creatorRisk +
      W.holder * holderConcentration +
      W.liquidity * liquidityWeakness +
      W.suspicious * suspiciousWallets +
      W.fakeVolume * fakeVolumeProbability,
  )

  const reasons: string[] = []
  if (creatorRisk > 0.55) reasons.push('creator_supply_high')
  if (holderConcentration > 0.6) reasons.push('holder_concentration')
  if (liquidityWeakness > 0.65) reasons.push('liquidity_weak')
  if (suspiciousWallets > 0.55) reasons.push('sniper_cluster')
  if (fakeVolumeProbability > 0.45) reasons.push('fake_volume_pattern')
  if (rrm.abnormalSellPressure > 0.5) reasons.push('insider_selling')

  return {
    rugScore,
    creatorRisk,
    holderConcentration,
    liquidityWeakness,
    suspiciousWallets,
    fakeVolumeProbability,
    blocked: rugScore >= RUG_BLOCK_THRESHOLD || rrm.blocked,
    reasons,
  }
}

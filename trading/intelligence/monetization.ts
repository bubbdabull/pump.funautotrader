import type {
  IntelligenceAlert,
  IntelligenceAlertType,
  SubscriptionTier,
  TokenIntelligence,
} from './types'
import { pumpAlertThreshold } from './pumpDetection'

export const FREE_TIER_DELAY_MS = 12_000
export const FREE_TIER_MAX_VISIBLE = 40

export type MonetizedTokenFields = {
  subscriptionTier?: SubscriptionTier
  /** Pro-only fields gated for free tier */
  smartMoneyFlow?: TokenIntelligence['smartMoneyFlow']
  smartMoneyScore?: number
  pumpProbabilityScore?: number
  pumpSignal?: TokenIntelligence['pumpSignal']
}

export function applySubscriptionTier<T extends MonetizedTokenFields>(
  token: T,
  tier: SubscriptionTier,
): T {
  if (tier === 'pro') {
    return { ...token, subscriptionTier: 'pro' }
  }
  return {
    ...token,
    subscriptionTier: 'free',
    smartMoneyFlow: 'NEUTRAL',
    smartMoneyScore: undefined,
    pumpProbabilityScore: undefined,
    pumpSignal: 'NO_SIGNAL',
  }
}

export function limitFreeTierVisible<T>(tokens: T[], tier: SubscriptionTier, limit = FREE_TIER_MAX_VISIBLE): T[] {
  if (tier === 'pro') return tokens
  return tokens.slice(0, limit)
}

export function evaluateIntelligenceAlerts(
  mint: string,
  intel: TokenIntelligence,
  now = Date.now(),
): IntelligenceAlert[] {
  const out: IntelligenceAlert[] = []
  if (intel.pumpProbabilityScore >= pumpAlertThreshold()) {
    out.push({
      type: 'pump_probability',
      mint,
      score: intel.score,
      pumpProbabilityScore: intel.pumpProbabilityScore,
      smartMoneyFlow: intel.smartMoneyFlow,
      pumpSignal: intel.pumpSignal,
      at: now,
    })
  }
  if (intel.smartMoneyFlow === 'SMART_MONEY_IN' && intel.smartMoneyScore >= 55) {
    out.push({
      type: 'smart_money_in',
      mint,
      score: intel.score,
      pumpProbabilityScore: intel.pumpProbabilityScore,
      smartMoneyFlow: intel.smartMoneyFlow,
      pumpSignal: intel.pumpSignal,
      at: now,
    })
  }
  if (intel.scoreVelocity >= 12 && intel.score >= 50) {
    out.push({
      type: 'volume_spike',
      mint,
      score: intel.score,
      pumpProbabilityScore: intel.pumpProbabilityScore,
      smartMoneyFlow: intel.smartMoneyFlow,
      pumpSignal: intel.pumpSignal,
      at: now,
    })
  }
  if (intel.pumpSignal === 'EARLY_BREAKOUT' && intel.pumpProbabilityScore >= 60) {
    out.push({
      type: 'migration',
      mint,
      score: intel.score,
      pumpProbabilityScore: intel.pumpProbabilityScore,
      smartMoneyFlow: intel.smartMoneyFlow,
      pumpSignal: intel.pumpSignal,
      at: now,
    })
  }
  return out
}

export function shouldEmitAlert(type: IntelligenceAlertType, tier: SubscriptionTier): boolean {
  if (tier === 'pro') return true
  return type === 'volume_spike'
}

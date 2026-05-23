import type { IntelligenceInput, SmartMoneyFlow } from './types'
import { clamp01 } from '../utils/math'
import type { TokenMarketState } from '../types'
import { computeSMS, type WalletTracker } from '../smartMoney/walletTracker'

export interface SmartMoneyIntelResult {
  smartMoneyScore: number
  smartMoneyFlow: SmartMoneyFlow
}

export function computeSmartMoneyIntel(
  _input: IntelligenceInput,
  state: TokenMarketState | undefined,
  tracker: WalletTracker,
): SmartMoneyIntelResult {
  if (!state?.trades.length) {
    return { smartMoneyScore: 0, smartMoneyFlow: 'NEUTRAL' }
  }

  const { sms, consistency, divergence } = computeSMS(state, tracker)
  const smartMoneyScore = Math.round(clamp01(sms) * 100)

  let smartMoneyFlow: SmartMoneyFlow = 'NEUTRAL'
  if (consistency >= 0.42 && divergence < 0.35) {
    smartMoneyFlow = 'SMART_MONEY_IN'
  } else if (divergence >= 0.45 && consistency < 0.25) {
    smartMoneyFlow = 'SMART_MONEY_EXIT'
  }

  return { smartMoneyScore, smartMoneyFlow }
}

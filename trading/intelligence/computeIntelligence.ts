import type { IntelligenceInput, TokenIntelligence } from './types'
import { computeUnifiedScore } from './scoringEngine'
import { classifySignalState } from './signalClassifier'
import { detectPump } from './pumpDetection'
import { computeSmartMoneyIntel } from './smartMoneyIntel'
import type { TokenMarketState } from '../types'
import type { WalletTracker } from '../smartMoney/walletTracker'

export function computeTokenIntelligence(
  input: IntelligenceInput,
  options?: {
    marketState?: TokenMarketState
    walletTracker?: WalletTracker
    now?: number
  },
): TokenIntelligence {
  const now = options?.now ?? Date.now()
  const { score, confidenceScore, dataCompletenessScore } = computeUnifiedScore(input, now)
  const signalState = classifySignalState(input, score, now)

  const smart = options?.marketState && options?.walletTracker
    ? computeSmartMoneyIntel(input, options.marketState, options.walletTracker)
    : { smartMoneyScore: 0, smartMoneyFlow: 'NEUTRAL' as const }

  const pump = detectPump(input, score, now)
  const prior = input.priorScore ?? score
  const scoreVelocity = Math.round((score - prior) * 10) / 10

  if (signalState === 'INVALID_SIGNAL') {
    return {
      signalState,
      score: 0,
      confidenceScore: 0,
      dataCompletenessScore,
      smartMoneyScore: 0,
      smartMoneyFlow: 'NEUTRAL',
      pumpProbabilityScore: 0,
      pumpSignal: 'NO_SIGNAL',
      scoreVelocity: 0,
    }
  }

  return {
    signalState,
    score,
    confidenceScore,
    dataCompletenessScore,
    smartMoneyScore: smart.smartMoneyScore,
    smartMoneyFlow: smart.smartMoneyFlow,
    pumpProbabilityScore: pump.pumpProbabilityScore,
    pumpSignal: pump.pumpSignal,
    scoreVelocity,
  }
}

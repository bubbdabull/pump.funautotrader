import type { IntelligenceInput, SignalState } from './types'
import { isInvalidToken } from './scoringEngine'
import { hasStreamTicks } from '../utils/feedQuality'
import { hasRealTimeTradeActivity } from '../utils/liveActivity'

export function classifySignalState(
  input: IntelligenceInput,
  score: number,
  now = Date.now(),
): SignalState {
  if (isInvalidToken(input, now)) return 'INVALID_SIGNAL'

  const live = hasRealTimeTradeActivity(input, now) || hasStreamTicks(input)
  const buyPressure =
    input.buyPressure1m != null
      ? input.buyPressure1m / 100
      : (input.analytics?.buyPressure1m ?? 0.5)
  const sellPressure = 1 - buyPressure
  const vol5 = input.volume5mSol ?? input.analytics?.windows.w30.volumeSol ?? 0
  const trades = input.trades1m ?? input.analytics?.windows.w60.tradeCount ?? 0

  if (sellPressure > 0.58 && trades >= 3 && vol5 > 0.15) {
    return 'DISTRIBUTION_SIGNAL'
  }

  if (
    score >= 55 &&
    (input.isActive || live) &&
    (buyPressure >= 0.52 || (input.momentumScore ?? 0) >= 45)
  ) {
    return 'MOMENTUM_SIGNAL'
  }

  if (live && (vol5 >= 0.04 || trades >= 2) && buyPressure >= 0.45) {
    return 'ACCUMULATION_SIGNAL'
  }

  return 'RAW_SIGNAL'
}

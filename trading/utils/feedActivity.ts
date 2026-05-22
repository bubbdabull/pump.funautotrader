import type { TradeTick } from '../types'
import { buyPressurePct } from '../quantitative/indicators'
import { marketCapUsdFromSol } from './tokenMedia'

export interface FeedActivityFields {
  lastTradeAt?: number
  trades1m: number
  volume5mSol: number
  buyPressure1m: number
  mcapChange5m: number
  isActive: boolean
}

type ActivityState = {
  trades: TradeTick[]
  liquidityHistory: { timestamp: number; marketCapSol: number }[]
  marketCapUsd: number
}

export function computeFeedActivity(
  state: ActivityState | null | undefined,
  now = Date.now(),
): FeedActivityFields {
  if (!state?.trades.length) {
    return {
      trades1m: 0,
      volume5mSol: 0,
      buyPressure1m: 50,
      mcapChange5m: 0,
      isActive: false,
    }
  }

  const { trades } = state
  const oneMin = now - 60_000
  const fiveMin = now - 5 * 60_000
  const trades1m = trades.filter((t) => t.timestamp >= oneMin).length
  const volume5mSol = trades
    .filter((t) => t.timestamp >= fiveMin)
    .reduce((a, t) => a + t.solAmount, 0)
  const buyPressure1m = Math.round(buyPressurePct(trades, 60_000, now) * 100)

  let mcapChange5m = 0
  const mcapTicks = trades
    .filter((t) => t.timestamp >= fiveMin && t.marketCapUsd && t.marketCapUsd > 0)
    .map((t) => ({ t: t.timestamp, m: t.marketCapUsd! }))
  if (mcapTicks.length >= 2) {
    const first = mcapTicks[0].m
    const last = mcapTicks[mcapTicks.length - 1].m
    if (first > 0) mcapChange5m = ((last - first) / first) * 100
  } else if (state.liquidityHistory.length >= 2) {
    const recent = state.liquidityHistory.filter((h) => h.timestamp >= fiveMin)
    const hist = recent.length >= 2 ? recent : state.liquidityHistory.slice(-6)
    const first = marketCapUsdFromSol(hist[0].marketCapSol)
    const last = marketCapUsdFromSol(hist[hist.length - 1].marketCapSol)
    if (first > 0) mcapChange5m = ((last - first) / first) * 100
  }

  const last = trades[trades.length - 1]
  const lastTradeAt = last?.timestamp
  const isActive = Boolean(lastTradeAt && lastTradeAt >= now - 60_000)

  return {
    lastTradeAt,
    trades1m,
    volume5mSol,
    buyPressure1m,
    mcapChange5m,
    isActive,
  }
}

import type { PumpToken } from '@/types'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import type { FeedTrade } from '@/services/api'

export function applyTradeTickToToken(token: PumpToken, tick: TradeTickPayload): PumpToken {
  const holders =
    tick.holders != null && tick.holders > 0 ? tick.holders : token.holders
  return {
    ...token,
    holders,
    holdersVerified:
      tick.holdersVerified != null
        ? tick.holdersVerified && holders >= 2
        : token.holdersVerified,
    lastTradeAt: tick.timestampMs,
    marketCap: tick.marketCapUsd ?? token.marketCap,
    bondingCurvePercent: tick.bondingCurvePercent ?? token.bondingCurvePercent,
    signalScore: tick.signalScore ?? token.signalScore,
    momentumScore: tick.momentumScore ?? token.momentumScore,
    buyPressure1m: tick.buyPressure1m ?? token.buyPressure1m,
    migrationProbability: tick.migrationProbability ?? token.migrationProbability,
    burstIgnition: tick.burstIgnition ?? token.burstIgnition,
    isActive: tick.isActive ?? true,
    updatedAt: tick.timestampMs,
  }
}

export function tradeTickToFeedTrade(tick: TradeTickPayload): FeedTrade {
  return {
    signature: tick.signature,
    wallet: tick.wallet,
    side: tick.side,
    solAmount: tick.solAmount,
    tokenAmount: tick.tokenAmount,
    timestampMs: tick.timestampMs,
    timestamp: new Date(tick.timestampMs).toISOString(),
  }
}

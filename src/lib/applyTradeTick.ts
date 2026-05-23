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
    isActive: true,
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

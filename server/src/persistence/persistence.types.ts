import type { FeedToken } from '../feed/feed.types'
import type {
  FeedActivityFields,
  QuantitativeScores,
  RugScoreBreakdown,
  SignalAttributionRecord,
} from '@phronis/trading'

export type PersistJob =
  | {
      type: 'wallet_activity'
      mint: string
      wallet: string
      side: 'buy' | 'sell'
      solAmount: number
      signature?: string
      slot?: number
      timestamp: number
    }
  | {
      type: 'token_live_activity'
      mint: string
      activity: FeedActivityFields
      meta?: { marketCap?: number; bondingCurvePercent?: number; volume24h?: number }
    }
  | { type: 'feed_token'; token: FeedToken }
  | { type: 'signal_attribution'; entry: SignalAttributionRecord }
  | {
      type: 'quant_snapshot'
      mint: string
      scores: QuantitativeScores
      rug: RugScoreBreakdown
    }

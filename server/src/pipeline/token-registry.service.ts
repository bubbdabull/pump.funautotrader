import { Injectable } from '@nestjs/common'
import {
  computeFeedActivity,
  filterForLane,
  evScoreToSignalScore,
  momentumScoreFromMetrics,
  evaluateEntry,
  type ScannerLane,
} from '@phronis/trading'
import { LiveFeedService } from '../feed/live-feed.service'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import type { FeedToken } from '../feed/feed.types'
import type { NormalizedToken, RegistrySnapshot } from './normalized-token.types'

@Injectable()
export class TokenRegistryService {
  constructor(
    private liveFeed: LiveFeedService,
    private trading: TradingBridgeService,
  ) {}

  get size(): number {
    return this.liveFeed.getAll(10_000).length
  }

  get(mint: string): NormalizedToken | undefined {
    const row = this.liveFeed.get(mint)
    return row ? this.normalize(row) : undefined
  }

  /** Merge stream-derived fields into registry (single write path). */
  upsert(row: FeedToken, source: NormalizedToken['source'] = 'stream'): NormalizedToken | null {
    const saved = this.liveFeed.patch(row) ?? this.liveFeed.upsert(row)
    if (!saved) return null
    return this.normalize(saved, source)
  }

  normalize(token: FeedToken, source: NormalizedToken['source'] = 'merged'): NormalizedToken {
    const state = this.trading.getState(token.mint)
    const activity = state ? computeFeedActivity(state) : {}
    let signalScore = token.signalScore
    let momentumScore = token.momentumScore
    if (state?.trades.length) {
      const metrics = evaluateEntry(state).metrics
      signalScore = evScoreToSignalScore(metrics)
      momentumScore = momentumScoreFromMetrics(metrics)
    }
    return {
      ...token,
      ...activity,
      signalScore,
      momentumScore,
      updatedAt: state?.lastUpdated ?? Date.now(),
      tradeCount: state?.trades.length ?? 0,
      source: state?.trades.length ? 'stream' : source,
    }
  }

  list(lane: ScannerLane = 'all', limit?: number): NormalizedToken[] {
    const raw = this.liveFeed.getAll(limit ?? 2000)
    const normalized = raw.map((t) => this.normalize(t))
    return filterForLane(normalized, lane) as NormalizedToken[]
  }

  snapshot(lane: ScannerLane = 'all'): RegistrySnapshot {
    return {
      lane,
      tokens: this.list(lane),
      updatedAt: new Date().toISOString(),
      streamFirst: true,
    }
  }

  /** Discovery pool rows from REST — merged without replacing stream state. */
  mergeDiscoveryRows(rows: FeedToken[]) {
    for (const row of rows) {
      const prev = this.liveFeed.get(row.mint)
      if (prev?.lastTradeAt || prev?.isActive) {
        this.liveFeed.patch({
          ...prev,
          image: row.image || prev.image,
          metadataUri: row.metadataUri ?? prev.metadataUri,
          holders: Math.max(prev.holders, row.holders),
          marketCap: Math.max(prev.marketCap, row.marketCap),
        })
      } else {
        this.liveFeed.upsert(row)
      }
    }
  }
}

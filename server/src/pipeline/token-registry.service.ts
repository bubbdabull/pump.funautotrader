import { Injectable } from '@nestjs/common'
import {
  filterForLane,
  type ScannerLane,
  type DynamicsAnalytics,
} from '@phronis/trading'
import { LiveFeedService } from '../feed/live-feed.service'
import type { FeedToken } from '../feed/feed.types'
import type { NormalizedToken, RegistrySnapshot } from './normalized-token.types'

/**
 * Lightweight registry: metadata + snapshot fields only.
 * Rolling velocity, burst, and lifecycle live in MarketDynamicsService.
 */
@Injectable()
export class TokenRegistryService {
  constructor(private liveFeed: LiveFeedService) {}

  get size(): number {
    return this.liveFeed.getAll(10_000).length
  }

  get(mint: string): NormalizedToken | undefined {
    const row = this.liveFeed.get(mint)
    return row ? this.normalize(row) : undefined
  }

  upsert(row: FeedToken, source: NormalizedToken['source'] = 'stream'): NormalizedToken | null {
    const saved = this.liveFeed.patch(row) ?? this.liveFeed.upsert(row)
    if (!saved) return null
    return this.normalize(saved, source)
  }

  normalize(
    token: FeedToken,
    source: NormalizedToken['source'] = 'merged',
    dynamics?: DynamicsAnalytics | null,
  ): NormalizedToken {
    const activity = dynamics
      ? {
          trades1m: dynamics.windows.w60.tradeCount,
          volume5mSol: dynamics.windows.w30.volumeSol,
          buyPressure1m: Math.round(dynamics.buyPressure1m * 100),
          isActive: Date.now() - dynamics.updatedAt < 60_000,
          lastTradeAt: dynamics.updatedAt,
        }
      : {}

    return {
      ...token,
      ...activity,
      signalScore: dynamics
        ? Math.round(dynamics.tradeConfidenceScore * 100)
        : token.signalScore,
      momentumScore: dynamics
        ? Math.round(dynamics.decayedMomentumScore * 100)
        : token.momentumScore,
      updatedAt: dynamics?.updatedAt ?? Date.now(),
      tradeCount: dynamics?.windows.w60.tradeCount ?? 0,
      source: dynamics ? 'stream' : source,
      lifecycle: dynamics?.lifecycle,
      migrationProbability: dynamics
        ? Math.round(dynamics.migration.probability * 100)
        : undefined,
      burstIgnition: dynamics ? Math.round(dynamics.burst.ignitionScore * 100) : undefined,
    }
  }

  list(lane: ScannerLane = 'all', limit?: number): NormalizedToken[] {
    const raw = this.liveFeed.getAll(limit ?? 2000)
    return filterForLane(raw.map((t) => this.normalize(t)), lane) as NormalizedToken[]
  }

  snapshot(lane: ScannerLane = 'all'): RegistrySnapshot {
    return {
      lane,
      tokens: this.list(lane),
      updatedAt: new Date().toISOString(),
      streamFirst: true,
    }
  }

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

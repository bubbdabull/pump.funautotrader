import { Injectable } from '@nestjs/common'
import type { DynamicsAnalytics } from '@phronis/trading'
import type { FeedToken } from '../feed/feed.types'
import { RedisWindowCacheService } from './redis-window-cache.service'
import { RedisLeaderboardService } from './redis-leaderboard.service'
import { RedisService } from './redis.service'
import type { RugScoreBreakdown } from '@phronis/trading'

/**
 * Single integration point for async Redis (never awaited on WS hot path).
 */
@Injectable()
export class RedisCacheHooksService {
  constructor(
    private redis: RedisService,
    private windowCache: RedisWindowCacheService,
    private leaderboard: RedisLeaderboardService,
  ) {}

  onTradeProcessed(mint: string, analytics: DynamicsAnalytics, _token?: FeedToken): void {
    if (!this.redis.enabled) return
    setImmediate(() => this.windowCache.scheduleBackup(mint, analytics))
  }

  onMarketScored(
    mint: string,
    analytics: DynamicsAnalytics,
    blendedScore: number,
    _rug: RugScoreBreakdown,
  ): void {
    if (!this.redis.enabled) return
    setImmediate(() => this.leaderboard.scheduleFromAnalytics(mint, analytics, blendedScore))
  }
}

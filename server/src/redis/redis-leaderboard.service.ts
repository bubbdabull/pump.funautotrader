import { Injectable } from '@nestjs/common'
import type { DynamicsAnalytics } from '@phronis/trading'
import { REDIS_KEYS, type LeaderboardLane } from './redis-keys'
import { RedisWriteQueueService } from './redis-write-queue.service'
import { RedisService, type RedisZMember } from './redis.service'
import { MarketDynamicsService } from '../intelligence/market-dynamics.service'

export interface LeaderboardEntry {
  mint: string
  score: number
  lane: LeaderboardLane
}

@Injectable()
export class RedisLeaderboardService {
  constructor(
    private redis: RedisService,
    private queue: RedisWriteQueueService,
    private dynamics: MarketDynamicsService,
  ) {}

  scheduleFromAnalytics(mint: string, analytics: DynamicsAnalytics, blendedScore: number): void {
    if (!this.redis.enabled) return
    const scoreKey = REDIS_KEYS.leaderboard.score
    const volKey = REDIS_KEYS.leaderboard.volume
    const migKey = REDIS_KEYS.leaderboard.migration
    const velKey = REDIS_KEYS.leaderboard.velocity

    this.queue.enqueueZadd(scoreKey, blendedScore, mint)
    this.queue.enqueueZadd(
      volKey,
      Math.round(analytics.windows.w15.volumeSol * 1000) / 1000,
      mint,
    )
    this.queue.enqueueZadd(
      migKey,
      Math.round(analytics.migration.probability * 1000),
      mint,
    )
    this.queue.enqueueZadd(
      velKey,
      Math.round(Math.max(0, analytics.velocity.volumeAcceleration) * 1000),
      mint,
    )
  }

  rebuildFromDynamics(limit = 100): void {
    if (!this.redis.enabled) return
    for (const a of this.dynamics.getRankings(limit)) {
      const blended = Math.round(a.tradeConfidenceScore * 100)
      this.scheduleFromAnalytics(a.mint, a, blended)
    }
  }

  async getTop(lane: LeaderboardLane, limit = 50): Promise<LeaderboardEntry[]> {
    const key = REDIS_KEYS.leaderboard[lane]
    const rows = await this.redis.zrevrangeWithScores(key, limit)
    return rows.map((r) => ({ mint: r.member, score: r.score, lane }))
  }

  async getRankingsWithFallback(
    lane: LeaderboardLane = 'score',
    limit = 50,
  ): Promise<Array<{ mint: string; confidence: number }>> {
    const fromRedis = await this.getTop(lane, limit)
    if (fromRedis.length >= Math.min(10, limit * 0.2)) {
      return fromRedis.map((r) => ({ mint: r.mint, confidence: Math.round(r.score) }))
    }
    return this.dynamics.getRankings(limit).map((a) => ({
      mint: a.mint,
      confidence: Math.round(a.tradeConfidenceScore * 100),
    }))
  }
}

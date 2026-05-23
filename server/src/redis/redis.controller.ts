import { Controller, Get, Header, Param, Query } from '@nestjs/common'
import { RedisLeaderboardService } from './redis-leaderboard.service'
import { RedisService } from './redis.service'
import { RedisWriteQueueService } from './redis-write-queue.service'
import { REDIS_KEYS, type LeaderboardLane } from './redis-keys'

@Controller('redis')
export class RedisController {
  constructor(
    private redis: RedisService,
    private redisLeaderboard: RedisLeaderboardService,
    private writeQueue: RedisWriteQueueService,
  ) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status() {
    const ping = this.redis.enabled ? await this.redis.ping() : false
    return {
      ...this.redis.getStats(),
      ping,
      writeQueue: this.writeQueue.getStats(),
    }
  }

  @Get('leaderboard/:lane')
  @Header('Cache-Control', 'no-store')
  async leaderboard(
    @Param('lane') lane: LeaderboardLane,
    @Query('limit') limit?: string,
  ) {
    const n = Math.min(100, Math.max(5, Number(limit) || 50))
    const rows = await this.redisLeaderboard.getRankingsWithFallback(lane, n)
    return { lane, limit: n, source: rows.length > 0 ? 'redis_or_memory' : 'empty', rows }
  }

  @Get('hot/:mint')
  @Header('Cache-Control', 'no-store')
  async hotToken(@Param('mint') mint: string) {
    const raw = await this.redis.get(REDIS_KEYS.hotToken(mint))
    if (!raw) return { mint, found: false }
    try {
      return { mint, found: true, data: JSON.parse(raw) }
    } catch {
      return { mint, found: false }
    }
  }
}

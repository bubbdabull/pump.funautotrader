import { Controller, Get, Param, Query } from '@nestjs/common'
import { QuantEngineService } from './quant-engine.service'
import { RedisLeaderboardService } from '../redis/redis-leaderboard.service'
import type { LeaderboardLane } from '../redis/redis-keys'

@Controller('quant')
export class QuantController {
  constructor(
    private quant: QuantEngineService,
    private redisLeaderboard: RedisLeaderboardService,
  ) {}

  @Get('rankings')
  async rankings(@Query('lane') lane?: LeaderboardLane) {
    const resolved = lane ?? 'score'
    const fromRedis = await this.redisLeaderboard.getRankingsWithFallback(resolved, 100)
    if (fromRedis.length >= 10) return fromRedis
    return this.quant.getRankings(100)
  }

  @Get('analyze/:mint')
  analyze(@Param('mint') mint: string) {
    return this.quant.analyzeMint(mint) ?? { error: 'no_market_state' }
  }
}

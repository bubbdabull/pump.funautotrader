import { Global, Module, forwardRef } from '@nestjs/common'
import { RedisService } from './redis.service'
import { RedisWriteQueueService } from './redis-write-queue.service'
import { RedisWindowCacheService } from './redis-window-cache.service'
import { RedisLeaderboardService } from './redis-leaderboard.service'
import { RedisSnapshotManagerService } from './redis-snapshot-manager.service'
import { RedisCacheHooksService } from './redis-cache-hooks.service'
import { RedisController } from './redis.controller'
import { FeedModule } from '../feed/feed.module'
import { IntelligenceModule } from '../intelligence/intelligence.module'
import { TradeDataModule } from '../trade-data/trade-data.module'
import { isApiProcess } from '../process-role'

@Global()
@Module({
  imports: [FeedModule, forwardRef(() => IntelligenceModule), TradeDataModule],
  controllers: isApiProcess() ? [RedisController] : [],
  providers: [
    RedisService,
    RedisWriteQueueService,
    RedisWindowCacheService,
    RedisLeaderboardService,
    RedisSnapshotManagerService,
    RedisCacheHooksService,
  ],
  exports: [
    RedisService,
    RedisWriteQueueService,
    RedisWindowCacheService,
    RedisLeaderboardService,
    RedisSnapshotManagerService,
    RedisCacheHooksService,
  ],
})
export class RedisModule {}

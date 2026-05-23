import { Injectable } from '@nestjs/common'
import type { DynamicsAnalytics } from '@phronis/trading'
import { REDIS_HOT_TOKEN_TTL_SEC, REDIS_WINDOW_TTL_SEC } from '@phronis/trading'
import { REDIS_KEYS } from './redis-keys'
import { RedisWriteQueueService } from './redis-write-queue.service'
import { RedisService } from './redis.service'

@Injectable()
export class RedisWindowCacheService {
  constructor(
    private redis: RedisService,
    private queue: RedisWriteQueueService,
  ) {}

  /** Write-through backup — never blocks ingestion. */
  scheduleBackup(mint: string, analytics: DynamicsAnalytics): void {
    if (!this.redis.enabled) return
    const w5 = analytics.windows.w5
    const w15 = analytics.windows.w15
    const ts = analytics.updatedAt

    this.queue.enqueueSet(
      REDIS_KEYS.tokenWindow(mint, 'volume:5s'),
      JSON.stringify({ volumeSol: w5.volumeSol, tradeCount: w5.tradeCount, ts }),
      REDIS_WINDOW_TTL_SEC,
    )
    this.queue.enqueueSet(
      REDIS_KEYS.tokenWindow(mint, 'volume:15s'),
      JSON.stringify({ volumeSol: w15.volumeSol, tradeCount: w15.tradeCount, ts }),
      REDIS_WINDOW_TTL_SEC,
    )
    this.queue.enqueueSet(
      REDIS_KEYS.tokenWindow(mint, 'wallets:15s'),
      JSON.stringify({ uniqueWallets: w15.uniqueWallets, ts }),
      REDIS_WINDOW_TTL_SEC,
    )
    this.queue.enqueueSet(
      REDIS_KEYS.tokenWindow(mint, 'trades:5s'),
      JSON.stringify({ tradeCount: w5.tradeCount, buyPressure: w5.buyPressure, ts }),
      REDIS_WINDOW_TTL_SEC,
    )

    this.queue.enqueueSet(
      REDIS_KEYS.hotToken(mint),
      JSON.stringify({
        mint,
        signalScore: Math.round(analytics.tradeConfidenceScore * 100),
        lifecycle: analytics.lifecycle,
        migrationProbability: Math.round(analytics.migration.probability * 100),
        volumeVelocity: analytics.velocity.volumeVelocity,
        lastTradeAt: analytics.updatedAt,
      }),
      REDIS_HOT_TOKEN_TTL_SEC,
    )
  }
}

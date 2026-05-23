import { Injectable, Inject, Logger, OnModuleInit, forwardRef } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'
import { IngestionLeaderService } from './ingestion-leader.service'
import { IngestionWorkerService } from '../streaming/ingestion-worker.service'
import type { IngestionEvent } from './ingestion.types'
import { isApiProcess } from '../process-role'

/** Fan-out ingestion events from leader → follower API machines (Socket.IO parity). */
@Injectable()
export class IngestionRelayService implements OnModuleInit {
  private readonly logger = new Logger(IngestionRelayService.name)

  constructor(
    private redis: RedisService,
    private leader: IngestionLeaderService,
    @Inject(forwardRef(() => IngestionWorkerService))
    private ingestionWorker: IngestionWorkerService,
  ) {}

  onModuleInit() {
    if (!isApiProcess() || !this.redis.enabled) return
    void this.redis.subscribe(REDIS_KEYS.ingestionChannel, (raw) => {
      if (this.leader.isIngestionLeader()) return
      try {
        const event = JSON.parse(raw) as IngestionEvent
        this.ingestionWorker.emit(event)
      } catch (err) {
        this.logger.debug(`Relay parse error: ${(err as Error).message}`)
      }
    })
    this.logger.log('Ingestion relay subscribed (follower fan-in)')
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { PERSIST_DRAIN_BATCH, PERSIST_QUEUE_MAX } from '@phronis/trading'
import type { PersistJob } from './persistence.types'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'
import { getProcessRole } from '../process-role'

type DrainHandler = (job: PersistJob) => Promise<void>

@Injectable()
export class PersistenceQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(PersistenceQueueService.name)
  private readonly queue: PersistJob[] = []
  private draining = false
  private handler: DrainHandler | null = null
  private dropped = 0

  constructor(private redis: RedisService) {}

  onModuleDestroy() {
    this.queue.length = 0
  }

  registerHandler(handler: DrainHandler) {
    this.handler = handler
  }

  /** Non-blocking enqueue — never awaits Supabase on caller stack. */
  enqueue(job: PersistJob) {
    if (this.queue.length >= PERSIST_QUEUE_MAX) {
      this.queue.shift()
      this.dropped++
    }
    this.queue.push(job)
    this.scheduleDrain()

    if (this.redis.enabled && getProcessRole() === 'api') {
      void this.redis.publish(REDIS_KEYS.persistChannel, JSON.stringify(job)).catch(() => undefined)
    }
  }

  getStats() {
    return {
      depth: this.queue.length,
      dropped: this.dropped,
      draining: this.draining,
    }
  }

  private scheduleDrain() {
    if (this.draining) return
    setImmediate(() => void this.drain())
  }

  private async drain() {
    if (!this.handler) return
    this.draining = true
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, PERSIST_DRAIN_BATCH)
        for (const job of batch) {
          try {
            await this.handler(job)
          } catch (err) {
            this.logger.debug(`Persist job ${job.type}: ${(err as Error).message}`)
          }
        }
        if (this.queue.length > 0) {
          await new Promise((r) => setImmediate(r))
        }
      }
    } finally {
      this.draining = false
    }
  }
}

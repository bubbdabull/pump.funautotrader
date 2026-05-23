import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  REDIS_WRITE_BATCH_MAX,
  REDIS_WRITE_FLUSH_MS,
  REDIS_WRITE_QUEUE_MAX,
} from '@phronis/trading'
import { RedisService } from './redis.service'

type QueuedOp =
  | { op: 'set'; key: string; value: string; ttlSec?: number }
  | { op: 'zadd'; key: string; score: number; member: string }
  | { op: 'del'; key: string }

@Injectable()
export class RedisWriteQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisWriteQueueService.name)
  private readonly queue: QueuedOp[] = []
  private timer?: NodeJS.Timeout
  private flushing = false
  private dropped = 0
  private flushed = 0

  constructor(private redis: RedisService) {}

  onModuleInit() {
    if (!this.redis.enabled) return
    this.timer = setInterval(() => void this.flush(), REDIS_WRITE_FLUSH_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    void this.flush()
  }

  getStats() {
    return {
      queued: this.queue.length,
      dropped: this.dropped,
      flushed: this.flushed,
    }
  }

  enqueueSet(key: string, value: string, ttlSec?: number) {
    this.enqueue({ op: 'set', key, value, ttlSec })
  }

  enqueueZadd(key: string, score: number, member: string) {
    if (!Number.isFinite(score)) return
    this.enqueue({ op: 'zadd', key, score, member })
  }

  enqueueDel(key: string) {
    this.enqueue({ op: 'del', key })
  }

  private enqueue(op: QueuedOp) {
    if (!this.redis.enabled) return
    if (this.queue.length >= REDIS_WRITE_QUEUE_MAX) {
      this.queue.shift()
      this.dropped++
    }
    this.queue.push(op)
  }

  private async flush() {
    if (this.flushing || this.queue.length === 0) return
    const client = this.redis.getClient()
    if (!client) return

    this.flushing = true
    const batch = this.queue.splice(0, REDIS_WRITE_BATCH_MAX)
    try {
      const pipe = client.pipeline()
      for (const item of batch) {
        if (item.op === 'set') {
          if (item.ttlSec && item.ttlSec > 0) {
            pipe.set(item.key, item.value, 'EX', item.ttlSec)
          } else {
            pipe.set(item.key, item.value)
          }
        } else if (item.op === 'zadd') {
          pipe.zadd(item.key, item.score, item.member)
        } else if (item.op === 'del') {
          pipe.del(item.key)
        }
      }
      await pipe.exec()
      this.flushed += batch.length
    } catch (err) {
      this.logger.debug(`Redis write batch failed: ${(err as Error).message}`)
    } finally {
      this.flushing = false
    }
  }
}

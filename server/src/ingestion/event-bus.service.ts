import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { IngestionEvent } from './ingestion.types'
import { normalizeRedisUrl, redisTlsOptions } from '../redis/redis-url'

type Handler = (event: IngestionEvent) => void | Promise<void>

/** In-process bus; publishes to Redis channel when REDIS_URL is set. */
@Injectable()
export class EventBusService implements OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name)
  private readonly handlers = new Set<Handler>()
  private readonly queue: IngestionEvent[] = []
  private readonly maxQueue = 10_000
  private draining = false
  private dropped = 0
  private redisPublisher: { publish: (ch: string, msg: string) => Promise<number> } | null =
    null
  private readonly channel = 'phronis:ingestion'

  constructor(private config: ConfigService) {
    void this.initRedis()
  }

  onModuleDestroy() {
    this.handlers.clear()
    this.queue.length = 0
  }

  private async initRedis() {
    if (this.config.get('REDIS_DISABLED') === 'true') return
    const url = normalizeRedisUrl(this.config.get('REDIS_URL'))
    if (!url) {
      if (this.config.get('REDIS_URL')?.trim()) {
        this.logger.warn('Redis bus skipped — REDIS_URL must be rediss://… not redis-cli flags')
      }
      return
    }
    try {
      const { default: Redis } = await import('ioredis')
      const client = new Redis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        retryStrategy: () => null,
        tls: redisTlsOptions(url),
      })
      client.on('error', (err) => this.logger.debug(`Redis bus: ${err.message}`))
      await client.connect()
      this.redisPublisher = client
      this.logger.log('Redis ingestion bus connected')
    } catch (err) {
      this.logger.warn(`Redis bus unavailable: ${(err as Error).message}`)
    }
  }

  subscribe(handler: Handler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async publish(event: IngestionEvent) {
    if (this.queue.length >= this.maxQueue) {
      this.queue.shift()
      this.dropped++
    }
    this.queue.push(event)
    if (!this.draining) void this.drain()
    await this.publishRemote(event)
  }

  /** Redis fan-out only — used by ingestion leader after local hot-path handling. */
  async publishRemote(event: IngestionEvent) {
    if (!this.redisPublisher) return
    try {
      await this.redisPublisher.publish(this.channel, JSON.stringify(event))
    } catch {
      /* non-fatal */
    }
  }

  private async drain() {
    this.draining = true
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 48)
      for (const ev of batch) {
        for (const h of this.handlers) {
          try {
            await h(ev)
          } catch (err) {
            this.logger.debug(`Handler error: ${(err as Error).message}`)
          }
        }
      }
      await new Promise<void>((r) => setImmediate(r))
    }
    this.draining = false
  }

  getStats() {
    return {
      queueDepth: this.queue.length,
      dropped: this.dropped,
      draining: this.draining,
      handlers: this.handlers.size,
      redis: Boolean(this.redisPublisher),
    }
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { IngestionEvent } from './ingestion.types'
import { normalizeRedisUrl, redisTlsOptions } from '../redis/redis-url'

type Handler = (event: IngestionEvent) => void | Promise<void>
type BatchHandler = (events: IngestionEvent[]) => void | Promise<void>

const INGESTION_BATCH_MS = 25
const PROCESSING_QUEUE_MAX = 12_000
const PROCESSING_LAG_PAUSE_MS = 8_000

/** In-process bus; publishes to Redis channel when REDIS_URL is set. */
@Injectable()
export class EventBusService implements OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name)
  private readonly handlers = new Set<Handler>()
  private readonly processingHandlers = new Set<BatchHandler>()
  private readonly queue: IngestionEvent[] = []
  private readonly processingQueue: IngestionEvent[] = []
  private readonly maxQueue = 10_000
  private draining = false
  private processingDraining = false
  private processingTimer?: NodeJS.Timeout
  private dropped = 0
  private processingDropped = 0
  private lastIngestAt = 0
  private lastProcessAt = 0
  private processingPaused = false
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

  /** Processing layer — batched micro-windows, isolated from ingestion publish. */
  subscribeProcessing(handler: BatchHandler) {
    this.processingHandlers.add(handler)
    return () => this.processingHandlers.delete(handler)
  }

  /** Ingestion layer entry — never awaits processing handlers. */
  publishIngestion(event: IngestionEvent) {
    this.lastIngestAt = Date.now()
    if (this.processingQueue.length >= PROCESSING_QUEUE_MAX) {
      this.processingQueue.shift()
      this.processingDropped++
    }
    this.processingQueue.push(event)
    this.scheduleProcessingDrain()
  }

  private scheduleProcessingDrain() {
    if (this.processingPaused) return
    const lag = this.lastIngestAt - this.lastProcessAt
    if (lag > PROCESSING_LAG_PAUSE_MS && this.processingQueue.length > 4_000) {
      this.processingPaused = true
      this.logger.warn(
        JSON.stringify({
          tag: 'processing_backpressure',
          lagMs: lag,
          depth: this.processingQueue.length,
        }),
      )
      setTimeout(() => {
        this.processingPaused = false
        this.scheduleProcessingDrain()
      }, 500)
      return
    }
    if (!this.processingTimer) {
      this.processingTimer = setTimeout(() => void this.drainProcessing(), INGESTION_BATCH_MS)
    }
  }

  private async drainProcessing() {
    this.processingTimer = undefined
    if (this.processingHandlers.size === 0) return
    this.processingDraining = true
    const batch = this.processingQueue.splice(0, 64)
    if (batch.length === 0) {
      this.processingDraining = false
      return
    }
    this.lastProcessAt = Date.now()
    for (const h of this.processingHandlers) {
      try {
        await h(batch)
      } catch (err) {
        this.logger.debug(`Processing batch error: ${(err as Error).message}`)
      }
    }
    if (this.processingQueue.length > 0) {
      this.scheduleProcessingDrain()
    } else {
      this.processingDraining = false
    }
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
    const lagMs =
      this.lastIngestAt > 0 && this.lastProcessAt > 0
        ? Math.max(0, this.lastIngestAt - this.lastProcessAt)
        : 0
    return {
      queueDepth: this.queue.length,
      processingDepth: this.processingQueue.length,
      processingLagMs: lagMs,
      processingPaused: this.processingPaused,
      dropped: this.dropped,
      processingDropped: this.processingDropped,
      draining: this.draining,
      processingDraining: this.processingDraining,
      handlers: this.handlers.size,
      processingHandlers: this.processingHandlers.size,
      redis: Boolean(this.redisPublisher),
    }
  }
}

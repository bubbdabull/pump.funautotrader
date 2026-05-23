import { Injectable, Logger } from '@nestjs/common'
import type { IngestionEvent } from './ingestion.types'

const POST_UPDATE_QUEUE_MAX = 2_500
const POST_UPDATE_MAX_CONCURRENT = 3

type Handler = (mint: string, event: IngestionEvent) => void | Promise<void>

/** Bounded async drain for registry/scoring — keeps WS + HTTP responsive. */
@Injectable()
export class PostUpdateQueueService {
  private readonly logger = new Logger(PostUpdateQueueService.name)
  private readonly handlers: Handler[] = []
  private readonly pending = new Map<string, IngestionEvent>()
  private readonly order: string[] = []
  private draining = false
  private inFlight = 0
  private dropped = 0
  private processed = 0
  private lastDrainAt = 0

  register(handler: Handler) {
    this.handlers.push(handler)
  }

  schedule(mint: string, event: IngestionEvent) {
    if (!mint || this.handlers.length === 0) return

    if (!this.pending.has(mint)) {
      if (this.order.length >= POST_UPDATE_QUEUE_MAX) {
        const evict = this.order.shift()
        if (evict) this.pending.delete(evict)
        this.dropped++
      }
      this.order.push(mint)
    }
    this.pending.set(mint, event)

    if (!this.draining) {
      this.draining = true
      setImmediate(() => this.drain())
    }
  }

  getStats() {
    return {
      depth: this.order.length,
      pendingMints: this.pending.size,
      inFlight: this.inFlight,
      dropped: this.dropped,
      processed: this.processed,
      lastDrainAt: this.lastDrainAt,
    }
  }

  private drain() {
    while (this.inFlight < POST_UPDATE_MAX_CONCURRENT && this.order.length > 0) {
      const mint = this.order.shift()!
      const event = this.pending.get(mint)
      this.pending.delete(mint)
      if (!event) continue

      this.inFlight++
      void this.run(mint, event).finally(() => {
        this.inFlight--
        this.processed++
        if (this.order.length > 0) {
          setImmediate(() => this.drain())
        } else if (this.inFlight === 0) {
          this.draining = false
        }
      })
    }

    this.lastDrainAt = Date.now()
    if (this.inFlight === 0 && this.order.length === 0) {
      this.draining = false
    }
  }

  private async run(mint: string, event: IngestionEvent) {
    for (const h of this.handlers) {
      try {
        await h(mint, event)
      } catch (err) {
        this.logger.debug(
          `Post-update handler error (${event.type}/${mint.slice(0, 8)}): ${(err as Error).message}`,
        )
      }
    }
  }
}

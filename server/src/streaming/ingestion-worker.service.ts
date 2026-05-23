import { Injectable, Logger } from '@nestjs/common'
import { DedupService } from '../ingestion/dedup.service'
import { EventBusService } from '../ingestion/event-bus.service'
import type { IngestionEvent } from '../ingestion/ingestion.types'

/**
 * Ingestion layer — parse/normalize at gateway, push events to bus only.
 * No scoring, registry, Redis, or DB in this service.
 */
@Injectable()
export class IngestionWorkerService {
  private readonly logger = new Logger(IngestionWorkerService.name)
  private published = 0
  private deduped = 0

  constructor(
    private dedup: DedupService,
    private bus: EventBusService,
  ) {}

  emit(event: IngestionEvent) {
    const key = `${event.source}:${event.type}:${event.id}`
    if (this.dedup.isDuplicate(key)) {
      this.deduped++
      return
    }
    this.published++
    try {
      this.bus.publishIngestion(event)
    } catch (err) {
      this.logger.debug(`emit failed: ${(err as Error).message}`)
    }
    void this.bus.publishRemote(event).catch(() => undefined)
  }

  getStats() {
    return {
      published: this.published,
      deduped: this.deduped,
      bus: this.bus.getStats(),
    }
  }
}

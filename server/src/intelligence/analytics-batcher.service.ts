import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { REGISTRY_PATCH_BATCH_MS } from '@phronis/trading'
import { EventsGateway } from '../events/events.gateway'
import type { NormalizedToken } from '../pipeline/normalized-token.types'

@Injectable()
export class AnalyticsBatcherService {
  private readonly patchQueue = new Map<string, NormalizedToken>()
  private patchTimer?: NodeJS.Timeout

  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
  ) {}

  scheduleRegistryPatch(token: NormalizedToken) {
    this.patchQueue.set(token.mint, token)
    if (!this.patchTimer) {
      this.patchTimer = setTimeout(() => this.flushPatches(), REGISTRY_PATCH_BATCH_MS)
    }
  }

  private flushPatches() {
    this.patchTimer = undefined
    for (const token of this.patchQueue.values()) {
      this.events.emitRegistryPatch(token)
    }
    this.patchQueue.clear()
  }
}

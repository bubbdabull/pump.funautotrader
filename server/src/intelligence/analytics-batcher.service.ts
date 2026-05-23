import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { REGISTRY_PATCH_BATCH_MS } from '@phronis/trading'
import { EventsGateway } from '../events/events.gateway'
import type { NormalizedToken } from '../pipeline/normalized-token.types'

const REGISTRY_PATCH_URGENT_MS = 40

@Injectable()
export class AnalyticsBatcherService {
  private readonly patchQueue = new Map<string, NormalizedToken>()
  private patchTimer?: NodeJS.Timeout
  private urgentTimer?: NodeJS.Timeout

  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
  ) {}

  scheduleRegistryPatch(token: NormalizedToken, _urgent = false) {
    this.patchQueue.set(token.mint, token)
    if (!this.patchTimer) {
      this.patchTimer = setTimeout(() => this.flushPatches(), REGISTRY_PATCH_BATCH_MS)
    }
    if (!this.urgentTimer) {
      this.urgentTimer = setTimeout(() => this.flushUrgent(), REGISTRY_PATCH_URGENT_MS)
    }
  }

  private flushUrgent() {
    this.urgentTimer = undefined
    if (!this.patchQueue.size) return
    const batch = [...this.patchQueue.values()].slice(0, 24)
    for (const token of batch) {
      this.events.emitRegistryPatch(token)
      this.patchQueue.delete(token.mint)
    }
    if (this.patchQueue.size > 0 && !this.patchTimer) {
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

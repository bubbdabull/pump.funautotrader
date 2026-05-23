import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { REGISTRY_PATCH_BATCH_MS, CHART_ANALYTICS_BATCH_MS } from '@phronis/trading'
import { EventsGateway } from '../events/events.gateway'
import { TerminalEmitterService } from './terminal-emitter.service'
import type { NormalizedToken } from '../pipeline/normalized-token.types'

@Injectable()
export class AnalyticsBatcherService {
  private readonly patchQueue = new Map<string, NormalizedToken>()
  private readonly chartMints = new Set<string>()
  private patchTimer?: NodeJS.Timeout
  private chartTimer?: NodeJS.Timeout

  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    private terminal: TerminalEmitterService,
  ) {}

  scheduleRegistryPatch(token: NormalizedToken) {
    this.patchQueue.set(token.mint, token)
    if (!this.patchTimer) {
      this.patchTimer = setTimeout(() => this.flushPatches(), REGISTRY_PATCH_BATCH_MS)
    }
  }

  scheduleChart(mint: string) {
    this.chartMints.add(mint)
    if (!this.chartTimer) {
      this.chartTimer = setTimeout(() => this.flushCharts(), CHART_ANALYTICS_BATCH_MS)
    }
  }

  private flushPatches() {
    this.patchTimer = undefined
    for (const token of this.patchQueue.values()) {
      this.events.emitRegistryPatch(token)
    }
    this.patchQueue.clear()
  }

  private flushCharts() {
    this.chartTimer = undefined
    for (const mint of this.chartMints) {
      this.events.emitChartUpdate(mint, 1_000, this.terminal.getProgression(mint))
    }
    this.chartMints.clear()
  }
}

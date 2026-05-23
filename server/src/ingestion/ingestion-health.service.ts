import { Injectable } from '@nestjs/common'
import { EventBusService } from './event-bus.service'
import type { IngestionOrchestratorService } from './ingestion-orchestrator.service'

/** Aggregated realtime pipeline diagnostics (merge PumpPortal status at health endpoint). */
@Injectable()
export class IngestionHealthService {
  private processErrors = 0
  private lastProcessErrorAt?: string
  private lastProcessErrorMsg?: string

  constructor(private bus: EventBusService) {}

  recordProcessError(err: unknown) {
    this.processErrors++
    this.lastProcessErrorAt = new Date().toISOString()
    this.lastProcessErrorMsg =
      err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
  }

  getDiagnostics(
    pumpportal?: Record<string, unknown> | null,
    orchestratorStats?: ReturnType<IngestionOrchestratorService['getStats']>,
  ) {
    const orchestrator = orchestratorStats ?? {
      processed: 0,
      rejected: 0,
      queueOverflow: 0,
      handleErrors: 0,
      hotQueueDepth: 0,
      hotDraining: false,
      bus: this.bus.getStats(),
    }
    const bus = this.bus.getStats()
    const pumpOk = pumpportal?.connected === true
    const feedOk =
      (Number(pumpportal?.liveFeedCount) || 0) > 0 ||
      (Number(pumpportal?.messagesReceived) || 0) > 0

    return {
      ok: pumpOk && feedOk,
      ingestionOk: pumpOk && orchestrator.hotQueueDepth < 4_000,
      pumpportal: pumpportal ?? null,
      orchestrator,
      bus,
      processErrors: this.processErrors,
      lastProcessErrorAt: this.lastProcessErrorAt,
      lastProcessErrorMsg: this.lastProcessErrorMsg,
      at: new Date().toISOString(),
    }
  }
}

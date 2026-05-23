import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { EventsGateway } from '../events/events.gateway'
import type { TradeTickPayload } from '../events/events.gateway'
import type { NormalizedToken } from '../pipeline/normalized-token.types'
import type { ChartUpdatePayload } from '../charts/chart-update.types'
import { AnalyticsBatcherService } from '../intelligence/analytics-batcher.service'

/**
 * Socket.IO emit layer — consumes processed snapshots only, never ingests trades.
 */
@Injectable()
export class WebSocketBroadcasterService {
  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    private batcher: AnalyticsBatcherService,
  ) {}

  scheduleRegistryPatch(token: NormalizedToken, urgent = false) {
    this.batcher.scheduleRegistryPatch(token, urgent)
  }

  emitTradeTick(payload: TradeTickPayload) {
    try {
      this.events.emitTradeTick(payload)
    } catch {
      /* non-fatal */
    }
  }

  emitChartDelta(payload: ChartUpdatePayload) {
    setImmediate(() => {
      try {
        this.events.emitChartDelta(payload)
      } catch {
        /* non-fatal */
      }
    })
  }

  emitIntelligenceAlert(payload: unknown) {
    setImmediate(() => {
      try {
        this.events.emitIntelligenceAlert(payload)
      } catch {
        /* non-fatal */
      }
    })
  }
}

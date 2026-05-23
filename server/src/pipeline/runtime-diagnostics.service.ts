import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { PostUpdateQueueService } from '../ingestion/post-update-queue.service'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'

@Injectable()
export class RuntimeDiagnosticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RuntimeDiagnostics')
  private timer?: NodeJS.Timeout

  constructor(
    private orchestrator: IngestionOrchestratorService,
    private postUpdate: PostUpdateQueueService,
    @Optional() private pumpportal?: PumpPortalDataGateway,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'production' && !process.env.FLY_APP_NAME) return
    this.timer = setInterval(() => this.logSnapshot(), 30_000)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private logSnapshot() {
    const orch = this.orchestrator.getStats()
    const post = this.postUpdate.getStats()
    const pump = this.pumpportal?.getHealth()
    const lagMs =
      pump?.lastMessageAtMs && pump.lastMessageAtMs > 0
        ? Math.max(0, Date.now() - pump.lastMessageAtMs)
        : null

    this.logger.log(
      JSON.stringify({
        tag: 'runtime',
        wsConnected: pump?.connected ?? false,
        ingestLagMs: lagMs,
        hotQueue: orch.bus?.processingDepth ?? 0,
        queueOverflow: orch.bus?.processingDropped ?? 0,
        postQueue: post.depth,
        postInFlight: post.inFlight,
        postDropped: post.dropped,
        messagesReceived: pump?.messagesReceived ?? 0,
      }),
    )
  }
}

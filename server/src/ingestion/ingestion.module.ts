import { Global, Module, forwardRef } from '@nestjs/common'
import { DedupService } from './dedup.service'
import { EventBusService } from './event-bus.service'
import { IngestionOrchestratorService } from './ingestion-orchestrator.service'
import { PostUpdateQueueService } from './post-update-queue.service'
import { IngestionHealthService } from './ingestion-health.service'
import { IngestionLeaderService } from './ingestion-leader.service'
import { IngestionRelayService } from './ingestion-relay.service'
import { PumpStreamSource } from './sources/pumpstream.source'
import { HeliusIngestSource } from './sources/helius-ingest.source'
import { HeliusWebhookController } from './helius-webhook.controller'
import { TradingModule } from '../trading/trading.module'
import { IntelligenceModule } from '../intelligence/intelligence.module'
import { HeliusModule } from '../helius/helius.module'

@Global()
@Module({
  imports: [TradingModule, HeliusModule, forwardRef(() => IntelligenceModule)],
  controllers: [HeliusWebhookController],
  providers: [
    DedupService,
    EventBusService,
    IngestionHealthService,
    IngestionLeaderService,
    IngestionRelayService,
    PostUpdateQueueService,
    IngestionOrchestratorService,
    PumpStreamSource,
    HeliusIngestSource,
  ],
  exports: [
    DedupService,
    EventBusService,
    PostUpdateQueueService,
    IngestionOrchestratorService,
    IngestionHealthService,
    IngestionLeaderService,
    PumpStreamSource,
    HeliusIngestSource,
  ],
})
export class IngestionModule {}

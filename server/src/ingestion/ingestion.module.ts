import { Global, Module } from '@nestjs/common'
import { DedupService } from './dedup.service'
import { EventBusService } from './event-bus.service'
import { IngestionOrchestratorService } from './ingestion-orchestrator.service'
import { PumpStreamSource } from './sources/pumpstream.source'
import { HeliusIngestSource } from './sources/helius-ingest.source'
import { TradingModule } from '../trading/trading.module'
import { IntelligenceModule } from '../intelligence/intelligence.module'

@Global()
@Module({
  imports: [TradingModule, IntelligenceModule],
  providers: [
    DedupService,
    EventBusService,
    IngestionOrchestratorService,
    PumpStreamSource,
    HeliusIngestSource,
  ],
  exports: [
    DedupService,
    EventBusService,
    IngestionOrchestratorService,
    PumpStreamSource,
    HeliusIngestSource,
  ],
})
export class IngestionModule {}

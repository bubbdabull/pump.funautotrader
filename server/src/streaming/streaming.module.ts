import { Global, Module, forwardRef } from '@nestjs/common'
import { FeedModule } from '../feed/feed.module'
import { IngestionModule } from '../ingestion/ingestion.module'
import { IntelligenceModule } from '../intelligence/intelligence.module'
import { PipelineModule } from '../pipeline/pipeline.module'
import { ChartsModule } from '../charts/charts.module'
import { EventsModule } from '../events/events.module'
import { TokensModule } from '../tokens/tokens.module'
import { AutoTraderModule } from '../autotrader/autotrader.module'
import { TradeDataModule } from '../trade-data/trade-data.module'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'
import { SnapshotService } from './snapshot.service'
import { IngestionWorkerService } from './ingestion-worker.service'
import { ProcessingWorkerService } from './processing-worker.service'
import { WebSocketBroadcasterService } from './websocket-broadcaster.service'

@Global()
@Module({
  imports: [
    FeedModule,
    forwardRef(() => IngestionModule),
    IntelligenceModule,
    ChartsModule,
    AutoTraderModule,
    TradeDataModule,
    forwardRef(() => PipelineModule),
    forwardRef(() => EventsModule),
    forwardRef(() => TokensModule),
    forwardRef(() => PumpPortalModule),
  ],
  providers: [
    SnapshotService,
    IngestionWorkerService,
    ProcessingWorkerService,
    WebSocketBroadcasterService,
  ],
  exports: [SnapshotService, IngestionWorkerService, ProcessingWorkerService, WebSocketBroadcasterService],
})
export class StreamingModule {}

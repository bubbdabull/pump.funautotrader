import { Module, forwardRef } from '@nestjs/common'
import { TokensController } from './tokens.controller'
import { TokensService } from './tokens.service'
import { TokenMetadataService } from './token-metadata.service'
import { PumpFeedSyncService } from './pump-feed-sync.service'
import { TokenDiscoveryService } from './token-discovery.service'
import { PumpModule } from '../pump/pump.module'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'
import { TradingModule } from '../trading/trading.module'
import { EventsModule } from '../events/events.module'
import { HoldersModule } from '../holders/holders.module'
import { PipelineModule } from '../pipeline/pipeline.module'
import { StreamingModule } from '../streaming/streaming.module'

@Module({
  imports: [
    PipelineModule,
    StreamingModule,
    PumpModule,
    TradingModule,
    forwardRef(() => EventsModule),
    forwardRef(() => HoldersModule),
    forwardRef(() => PumpPortalModule),
  ],
  controllers: [TokensController],
  providers: [TokensService, TokenMetadataService, PumpFeedSyncService, TokenDiscoveryService],
  exports: [TokensService, TokenMetadataService, PumpFeedSyncService, TokenDiscoveryService],
})
export class TokensModule {}

import { Module, forwardRef } from '@nestjs/common'
import { TokensController } from './tokens.controller'
import { TokensService } from './tokens.service'
import { TokenMetadataService } from './token-metadata.service'
import { PumpFeedSyncService } from './pump-feed-sync.service'
import { PumpModule } from '../pump/pump.module'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'
import { TradingModule } from '../trading/trading.module'
import { EventsModule } from '../events/events.module'
import { HoldersModule } from '../holders/holders.module'

@Module({
  imports: [
    PumpModule,
    TradingModule,
    EventsModule,
    forwardRef(() => HoldersModule),
    forwardRef(() => PumpPortalModule),
  ],
  controllers: [TokensController],
  providers: [TokensService, TokenMetadataService, PumpFeedSyncService],
  exports: [TokensService, TokenMetadataService, PumpFeedSyncService],
})
export class TokensModule {}

import { Global, Module, forwardRef } from '@nestjs/common'
import { TokensModule } from '../tokens/tokens.module'
import { TradePersistService } from './trade-persist.service'
import { TradeRehydrateService } from './trade-rehydrate.service'
import { FeedTradePinService } from './feed-trade-pin.service'
import { HotMintsService } from './hot-mints.service'
import { DataHealthService } from './data-health.service'
import { PumpPortalStatusResolver } from './pumpportal-status.resolver'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'
import { IngestionModule } from '../ingestion/ingestion.module'
import { TradingModule } from '../trading/trading.module'
import { AutoTraderModule } from '../autotrader/autotrader.module'

@Global()
@Module({
  imports: [
    IngestionModule,
    TradingModule,
    AutoTraderModule,
    forwardRef(() => TokensModule),
    forwardRef(() => PumpPortalModule), // leader status for health API on followers
  ],
  providers: [
    TradePersistService,
    TradeRehydrateService,
    FeedTradePinService,
    HotMintsService,
    DataHealthService,
    PumpPortalStatusResolver,
  ],
  exports: [FeedTradePinService, HotMintsService, DataHealthService, PumpPortalStatusResolver],
})
export class TradeDataModule {}

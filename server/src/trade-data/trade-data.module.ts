import { Global, Module, forwardRef } from '@nestjs/common'
import { TokensModule } from '../tokens/tokens.module'
import { TradePersistService } from './trade-persist.service'
import { TradeRehydrateService } from './trade-rehydrate.service'
import { FeedTradePinService } from './feed-trade-pin.service'
import { HotMintsService } from './hot-mints.service'
import { DataHealthService } from './data-health.service'
import { IngestionModule } from '../ingestion/ingestion.module'
import { TradingModule } from '../trading/trading.module'
import { AutoTraderModule } from '../autotrader/autotrader.module'

@Global()
@Module({
  imports: [IngestionModule, TradingModule, AutoTraderModule, forwardRef(() => TokensModule)],
  providers: [
    TradePersistService,
    TradeRehydrateService,
    FeedTradePinService,
    HotMintsService,
    DataHealthService,
  ],
  exports: [FeedTradePinService, HotMintsService, DataHealthService],
})
export class TradeDataModule {}

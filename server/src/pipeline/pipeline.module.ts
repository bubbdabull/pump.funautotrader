import { Global, Module, forwardRef } from '@nestjs/common'
import { TokenRegistryService } from './token-registry.service'
import { RawEventProcessorService } from './raw-event-processor.service'
import { IngestionModule } from '../ingestion/ingestion.module'
import { TradingModule } from '../trading/trading.module'
import { TokensModule } from '../tokens/tokens.module'
import { EventsModule } from '../events/events.module'
import { AutoTraderModule } from '../autotrader/autotrader.module'
import { TradeDataModule } from '../trade-data/trade-data.module'

@Global()
@Module({
  imports: [
    IngestionModule,
    TradingModule,
    forwardRef(() => TokensModule),
    forwardRef(() => EventsModule),
    AutoTraderModule,
    TradeDataModule,
  ],
  providers: [TokenRegistryService, RawEventProcessorService],
  exports: [TokenRegistryService, RawEventProcessorService],
})
export class PipelineModule {}

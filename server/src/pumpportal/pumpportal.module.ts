import { Module, forwardRef } from '@nestjs/common'
import { PumpPortalController } from './pumpportal.controller'
import { PumpPortalService } from './pumpportal.service'
import { PumpPortalDataGateway } from './pumpportal-data.gateway'
import { EventsModule } from '../events/events.module'
import { AutoTraderModule } from '../autotrader/autotrader.module'
import { TradingModule } from '../trading/trading.module'
import { TokensModule } from '../tokens/tokens.module'
import { IngestionModule } from '../ingestion/ingestion.module'
import { QuantModule } from '../quant/quant.module'

@Module({
  imports: [
    TradingModule,
    IngestionModule,
    forwardRef(() => QuantModule),
    forwardRef(() => EventsModule),
    forwardRef(() => TokensModule),
    AutoTraderModule,
  ],
  controllers: [PumpPortalController],
  providers: [PumpPortalService, PumpPortalDataGateway],
  exports: [PumpPortalService, PumpPortalDataGateway],
})
export class PumpPortalModule {}

import { Module, forwardRef } from '@nestjs/common'
import { EventsGateway } from './events.gateway'
import { TokensModule } from '../tokens/tokens.module'
import { AutoTraderModule } from '../autotrader/autotrader.module'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'

@Module({
  imports: [forwardRef(() => TokensModule), AutoTraderModule, forwardRef(() => PumpPortalModule)],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}

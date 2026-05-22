import { Module, forwardRef } from '@nestjs/common'
import { EventsGateway } from './events.gateway'
import { TokensModule } from '../tokens/tokens.module'
import { AutoTraderModule } from '../autotrader/autotrader.module'

@Module({
  imports: [forwardRef(() => TokensModule), AutoTraderModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}

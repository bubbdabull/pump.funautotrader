import { Module, forwardRef } from '@nestjs/common'
import { EventsGateway } from './events.gateway'
import { TokensModule } from '../tokens/tokens.module'

@Module({
  imports: [forwardRef(() => TokensModule)],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}

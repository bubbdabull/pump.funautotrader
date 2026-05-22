import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AutoTraderController } from './autotrader.controller'
import { AutoTraderService } from './autotrader.service'
import { TradingModule } from '../trading/trading.module'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [ConfigModule, TradingModule, forwardRef(() => EventsModule)],
  controllers: [AutoTraderController],
  providers: [AutoTraderService],
  exports: [AutoTraderService],
})
export class AutoTraderModule {}

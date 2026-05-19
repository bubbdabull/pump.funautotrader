import { Module } from '@nestjs/common'
import { AutoTraderController } from './autotrader.controller'
import { AutoTraderService } from './autotrader.service'
import { TradingModule } from '../trading/trading.module'

@Module({
  imports: [TradingModule],
  controllers: [AutoTraderController],
  providers: [AutoTraderService],
  exports: [AutoTraderService],
})
export class AutoTraderModule {}

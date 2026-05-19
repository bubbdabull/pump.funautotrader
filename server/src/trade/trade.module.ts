import { Module } from '@nestjs/common'
import { TradeController } from './trade.controller'
import { TradeService } from './trade.service'
import { PumpPortalModule } from '../pumpportal/pumpportal.module'

@Module({
  imports: [PumpPortalModule],
  controllers: [TradeController],
  providers: [TradeService],
})
export class TradeModule {}

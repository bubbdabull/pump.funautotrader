import { Global, Module } from '@nestjs/common'
import { TradingBridgeService } from './trading-bridge.service'

@Global()
@Module({
  providers: [TradingBridgeService],
  exports: [TradingBridgeService],
})
export class TradingModule {}

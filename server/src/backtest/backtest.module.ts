import { Module } from '@nestjs/common'
import { BacktestService } from './backtest.service'
import { BacktestController } from './backtest.controller'

@Module({
  controllers: [BacktestController],
  providers: [BacktestService],
  exports: [BacktestService],
})
export class BacktestModule {}

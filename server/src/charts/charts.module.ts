import { Global, Module } from '@nestjs/common'
import { TradingModule } from '../trading/trading.module'
import { ChartAggregationService } from './chart-aggregation.service'

@Global()
@Module({
  imports: [TradingModule],
  providers: [ChartAggregationService],
  exports: [ChartAggregationService],
})
export class ChartsModule {}

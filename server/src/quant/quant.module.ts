import { Module, forwardRef } from '@nestjs/common'
import { QuantEngineService } from './quant-engine.service'
import { QuantController } from './quant.controller'
import { TradingModule } from '../trading/trading.module'
import { EventsModule } from '../events/events.module'
import { IngestionModule } from '../ingestion/ingestion.module'
import { SupabaseModule } from '../supabase/supabase.module'
import { HoldersModule } from '../holders/holders.module'
import { IntelligenceModule } from '../intelligence/intelligence.module'

@Module({
  imports: [
    TradingModule,
    IntelligenceModule,
    forwardRef(() => EventsModule),
    IngestionModule,
    SupabaseModule,
    forwardRef(() => HoldersModule),
  ],
  controllers: [QuantController],
  providers: [QuantEngineService],
  exports: [QuantEngineService],
})
export class QuantModule {}

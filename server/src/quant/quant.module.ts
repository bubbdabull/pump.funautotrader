import { Module } from '@nestjs/common'
import { QuantEngineService } from './quant-engine.service'
import { QuantPersistService } from './quant-persist.service'
import { QuantController } from './quant.controller'
import { TradingModule } from '../trading/trading.module'
import { EventsModule } from '../events/events.module'
import { IngestionModule } from '../ingestion/ingestion.module'
import { SupabaseModule } from '../supabase/supabase.module'

@Module({
  imports: [TradingModule, EventsModule, IngestionModule, SupabaseModule],
  controllers: [QuantController],
  providers: [QuantEngineService, QuantPersistService],
  exports: [QuantEngineService, QuantPersistService],
})
export class QuantModule {}

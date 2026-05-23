import { Global, Module } from '@nestjs/common'
import { PersistenceQueueService } from './persistence-queue.service'
import { PersistenceWorkerService } from './persistence-worker.service'
import { RedisModule } from '../redis/redis.module'
import { SupabaseModule } from '../supabase/supabase.module'
import { TradingModule } from '../trading/trading.module'
import { QuantPersistService } from '../quant/quant-persist.service'

@Global()
@Module({
  imports: [RedisModule, SupabaseModule, TradingModule],
  providers: [PersistenceQueueService, PersistenceWorkerService, QuantPersistService],
  exports: [PersistenceQueueService],
})
export class PersistenceModule {}

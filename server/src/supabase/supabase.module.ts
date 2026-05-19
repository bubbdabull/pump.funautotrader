import { Global, Module } from '@nestjs/common'
import { SupabaseDbService } from './supabase-db.service'

@Global()
@Module({
  providers: [SupabaseDbService],
  exports: [SupabaseDbService],
})
export class SupabaseModule {}

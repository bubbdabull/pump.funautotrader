import { Global, Module } from '@nestjs/common'
import { SupabaseDbService } from './supabase-db.service'
import { SupabasePersistenceService } from './supabase-persistence.service'

@Global()
@Module({
  providers: [SupabaseDbService, SupabasePersistenceService],
  exports: [SupabaseDbService, SupabasePersistenceService],
})
export class SupabaseModule {}

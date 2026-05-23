import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PersistenceModule } from './persistence/persistence.module'
import { RedisModule } from './redis/redis.module'
import { SupabaseModule } from './supabase/supabase.module'
import { PrismaModule } from './prisma/prisma.module'

/** Lean worker: async Supabase drain only (no PumpPortal / Socket.IO). */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SupabaseModule,
    RedisModule,
    PersistenceModule,
  ],
})
export class PersistWorkerModule {}

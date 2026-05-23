import { Controller, Get, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SupabaseDbService } from './supabase/supabase-db.service'
import { RedisService } from './redis/redis.service'
import { RedisWriteQueueService } from './redis/redis-write-queue.service'
import { PersistenceQueueService } from './persistence/persistence-queue.service'
import { SolanaRpcService } from './rpc/solana-rpc.service'
import { getProcessRole } from './process-role'

@Controller()
export class HealthController {
  constructor(
    private config: ConfigService,
    private supabase: SupabaseDbService,
    @Optional() private redis?: RedisService,
    @Optional() private redisQueue?: RedisWriteQueueService,
    @Optional() private persistQueue?: PersistenceQueueService,
    @Optional() private solanaRpc?: SolanaRpcService,
  ) {}

  @Get('health')
  async health() {
    const keyConfigured = Boolean(
      this.config.get('SUPABASE_URL')?.trim() &&
        this.config.get('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
    )
    return {
      ok: true,
      service: 'phronis-api',
      at: new Date().toISOString(),
      processRole: getProcessRole(),
      supabase: this.supabase.enabled,
      supabaseKeyConfigured: keyConfigured,
      pumpportalKey: Boolean(this.config.get('PUMPPORTAL_API_KEY')?.trim()),
      heliusKey: Boolean(this.config.get('HELIUS_API_KEY')?.trim()),
      rpcProvider: this.solanaRpc?.provider ?? 'unknown',
      rpcDedicated: this.solanaRpc?.isDedicated ?? false,
      redis: this.redis?.enabled ?? false,
      redisConnected: this.redis?.isConnected ?? false,
      redisPing: this.redis?.enabled ? await this.redis.ping() : false,
      redisWriteQueue: this.redisQueue?.getStats(),
      persistQueue: this.persistQueue?.getStats(),
      holderEnrichIntervalMs: Number(this.config.get('HOLDER_ENRICH_INTERVAL_MS') ?? 90_000),
      supabaseRest: process.env.USE_SUPABASE_REST_DB === 'true',
      redisDisabled: process.env.REDIS_DISABLED === 'true',
    }
  }
}

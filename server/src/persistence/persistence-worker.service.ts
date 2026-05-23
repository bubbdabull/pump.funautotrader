import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { SupabaseDbService } from '../supabase/supabase-db.service'
import { QuantPersistService } from '../quant/quant-persist.service'
import { PersistenceQueueService } from './persistence-queue.service'
import type { PersistJob } from './persistence.types'
import { getProcessRole } from '../process-role'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'

@Injectable()
export class PersistenceWorkerService implements OnModuleInit {
  private readonly logger = new Logger(PersistenceWorkerService.name)

  constructor(
    private queue: PersistenceQueueService,
    private supabase: SupabaseDbService,
    private quantPersist: QuantPersistService,
    private redis: RedisService,
  ) {}

  onModuleInit() {
    this.queue.registerHandler((job) => this.handle(job))
    const role = getProcessRole()
    this.logger.log(`Persistence worker active (role=${role}, supabase=${this.supabase.enabled})`)

    if (this.redis.enabled && getProcessRole() === 'persist') {
      void this.redis.subscribe(REDIS_KEYS.persistChannel, (raw) => {
        try {
          const job = JSON.parse(raw) as PersistJob
          void this.handle(job)
        } catch {
          /* ignore */
        }
      })
    }
  }

  private async handle(job: PersistJob): Promise<void> {
    if (!this.supabase.enabled) return

    switch (job.type) {
      case 'wallet_activity':
        await this.supabase.insertWalletActivityOnce(job.mint, {
          wallet: job.wallet,
          side: job.side,
          solAmount: job.solAmount,
          signature: job.signature,
          slot: job.slot,
          timestamp: job.timestamp,
        })
        break
      case 'token_live_activity':
        await this.supabase.patchTokenLiveActivity(job.mint, job.activity, job.meta)
        break
      case 'feed_token':
        await this.supabase.upsertFeedToken(job.token)
        break
      case 'signal_attribution':
        await this.supabase.insertSignalAttribution(job.entry)
        break
      case 'quant_snapshot':
        await this.quantPersist.persistDirect(job.mint, job.scores, job.rug)
        break
      default:
        break
    }
  }
}

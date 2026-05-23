import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { SupabasePersistenceService } from '../supabase/supabase-persistence.service'
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
    private supabasePersist: SupabasePersistenceService,
    private redis: RedisService,
  ) {}

  onModuleInit() {
    this.queue.registerHandler((job) => this.handleSafe(job))
    const role = getProcessRole()
    this.logger.log(
      `Persistence worker active (role=${role}, supabase=${this.supabasePersist.enabled})`,
    )

    if (this.redis.enabled && getProcessRole() === 'persist') {
      void this.redis.subscribe(REDIS_KEYS.persistChannel, (raw) => {
        try {
          const job = JSON.parse(raw) as PersistJob
          void this.handleSafe(job)
        } catch {
          /* ignore */
        }
      })
    }
  }

  private async handleSafe(job: PersistJob): Promise<void> {
    try {
      await this.supabasePersist.handleJob(job)
    } catch (err) {
      this.logger.debug(`Persist job ${job.type}: ${(err as Error).message}`)
    }
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'
import { isApiProcess } from '../process-role'

const LEADER_TTL_SEC = 25
const LEADER_TICK_MS = 10_000

/**
 * Ensures only one Fly machine owns PumpPortal websocket ingestion.
 * Followers serve HTTP/Socket.IO and consume Redis-fanned ingestion events.
 */
@Injectable()
export class IngestionLeaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionLeaderService.name)
  private readonly instanceId =
    process.env.FLY_MACHINE_ID?.trim() ||
    process.env.FLY_ALLOC_ID?.trim() ||
    process.env.HOSTNAME?.trim() ||
    `pid-${process.pid}`

  private isLeader = false
  private leaderId: string | null = null
  private tickTimer?: NodeJS.Timeout
  private readonly listeners = new Set<(leader: boolean) => void>()

  constructor(
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    if (!isApiProcess()) return
    const forceSingle = process.env.INGESTION_SINGLE_LEADER !== 'false'
    if (!process.env.FLY_APP_NAME && forceSingle) {
      this.promoteLeader('local-single-process')
      return
    }
    if (!this.redis.enabled) {
      this.logger.warn('Redis disabled — assuming single-process ingestion leader')
      this.promoteLeader('no-redis')
      return
    }
    void this.tick()
    this.tickTimer = setInterval(() => void this.tick(), LEADER_TICK_MS)
  }

  onModuleDestroy() {
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.isLeader) {
      void this.redis.deleteIfValue(REDIS_KEYS.ingestionLeader, this.instanceId)
    }
  }

  getInstanceId(): string {
    return this.instanceId
  }

  getLeaderId(): string | null {
    return this.leaderId
  }

  isIngestionLeader(): boolean {
    return this.isLeader
  }

  onLeaderChange(handler: (leader: boolean) => void): () => void {
    this.listeners.add(handler)
    handler(this.isLeader)
    return () => this.listeners.delete(handler)
  }

  private async tick() {
    if (this.isLeader) {
      const ok = await this.redis.renewLock(
        REDIS_KEYS.ingestionLeader,
        this.instanceId,
        LEADER_TTL_SEC,
      )
      if (!ok) {
        const current = await this.redis.get(REDIS_KEYS.ingestionLeader)
        this.demoteLeader(current)
      }
      return
    }
    const acquired = await this.redis.setNx(
      REDIS_KEYS.ingestionLeader,
      this.instanceId,
      LEADER_TTL_SEC,
    )
    if (acquired) this.promoteLeader(this.instanceId)
    else {
      const current = await this.redis.get(REDIS_KEYS.ingestionLeader)
      if (current === this.instanceId) this.promoteLeader(this.instanceId)
    }
  }

  private promoteLeader(leaderId: string) {
    if (this.isLeader) return
    this.isLeader = true
    this.leaderId = leaderId
    this.logger.log(`Ingestion leader acquired (${this.instanceId})`)
    this.notify()
  }

  private demoteLeader(leaderId: string | null) {
    if (!this.isLeader) return
    this.isLeader = false
    this.leaderId = leaderId
    this.logger.warn(
      `Ingestion leader lost — standing down PumpPortal WS (owner=${leaderId ?? 'unknown'})`,
    )
    this.notify()
  }

  private notify() {
    for (const h of this.listeners) {
      try {
        h(this.isLeader)
      } catch {
        /* listener error */
      }
    }
  }
}

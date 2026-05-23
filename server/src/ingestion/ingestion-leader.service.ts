import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'
import { isApiProcess } from '../process-role'
import { encodeIngestionLease, parseIngestionLease } from './ingestion-lease'

const DEFAULT_LEADER_TTL_SEC = 45
const DEFAULT_TICK_MS = 8_000
const RENEW_JITTER_MS = 2_000
const MAX_RENEW_FAILURES = 4
const RENEW_RETRY_MS = 180
const MIN_LEADERSHIP_HOLD_MS = 30_000
const ACQUIRE_COOLDOWN_MS = 12_000

export type IngestionLeaderDiagnostics = {
  instanceId: string
  isLeader: boolean
  leaderId: string | null
  leaseExpiresAtMs: number | null
  leaderSinceMs: number | null
  leadershipUptimeMs: number
  renewFailures: number
  failoverCount: number
  lastRenewAtMs: number | null
  lastRenewLatencyMs: number | null
  acquireCooldownUntilMs: number | null
  tickInFlight: boolean
}

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

  private readonly leaderTtlSec = Math.max(
    20,
    Number(process.env.INGESTION_LEADER_TTL_SEC) || DEFAULT_LEADER_TTL_SEC,
  )
  private readonly tickMs = Math.max(
    4_000,
    Number(process.env.INGESTION_LEADER_TICK_MS) || DEFAULT_TICK_MS,
  )

  private isLeader = false
  private leaderId: string | null = null
  private leaderSinceMs = 0
  private leaseExpiresAtMs = 0
  private lastLeaseValue: string | null = null
  private tickTimer?: NodeJS.Timeout
  private tickInFlight = false
  private consecutiveRenewFailures = 0
  private failoverCount = 0
  private lastRenewAtMs = 0
  private lastRenewLatencyMs = 0
  private acquireBlockedUntilMs = 0
  private destroyed = false
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
    this.scheduleTick(500)
  }

  onModuleDestroy() {
    this.destroyed = true
    if (this.tickTimer) clearTimeout(this.tickTimer)
    if (this.isLeader && this.lastLeaseValue) {
      void this.redis.deleteIfValue(REDIS_KEYS.ingestionLeader, this.lastLeaseValue)
    } else if (this.isLeader) {
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

  getDiagnostics(): IngestionLeaderDiagnostics {
    const now = Date.now()
    return {
      instanceId: this.instanceId,
      isLeader: this.isLeader,
      leaderId: this.leaderId,
      leaseExpiresAtMs: this.leaseExpiresAtMs || null,
      leaderSinceMs: this.leaderSinceMs || null,
      leadershipUptimeMs:
        this.isLeader && this.leaderSinceMs > 0 ? now - this.leaderSinceMs : 0,
      renewFailures: this.consecutiveRenewFailures,
      failoverCount: this.failoverCount,
      lastRenewAtMs: this.lastRenewAtMs || null,
      lastRenewLatencyMs: this.lastRenewLatencyMs || null,
      acquireCooldownUntilMs: this.acquireBlockedUntilMs || null,
      tickInFlight: this.tickInFlight,
    }
  }

  onLeaderChange(handler: (leader: boolean) => void): () => void {
    this.listeners.add(handler)
    handler(this.isLeader)
    return () => this.listeners.delete(handler)
  }

  private scheduleTick(delayMs = this.tickMs) {
    if (this.destroyed) return
    if (this.tickTimer) clearTimeout(this.tickTimer)
    const jitter = Math.floor(Math.random() * RENEW_JITTER_MS)
    this.tickTimer = setTimeout(() => {
      void this.runTick()
    }, delayMs + jitter)
    this.tickTimer.unref?.()
  }

  private async runTick() {
    if (this.destroyed) return
    if (this.tickInFlight) {
      this.scheduleTick()
      return
    }
    this.tickInFlight = true
    try {
      await this.tick()
    } catch (err) {
      this.logger.debug(`Leader tick error: ${(err as Error).message}`)
    } finally {
      this.tickInFlight = false
      this.scheduleTick()
    }
  }

  private async tick() {
    if (this.isLeader) {
      await this.tickAsLeader()
      return
    }
    await this.tickAsFollower()
  }

  private async tickAsLeader() {
    const renewed = await this.renewWithRetry()
    if (renewed) {
      this.consecutiveRenewFailures = 0
      return
    }

    const lease = await this.readLease()
    const stillOurs = lease?.ownerId === this.instanceId
    const heldMs = this.leaderSinceMs > 0 ? Date.now() - this.leaderSinceMs : 0

    if (stillOurs) {
      this.consecutiveRenewFailures++
      if (this.consecutiveRenewFailures < MAX_RENEW_FAILURES) {
        this.logger.warn(
          `Leader lease renew failed (${this.consecutiveRenewFailures}/${MAX_RENEW_FAILURES}) — keeping ingestion`,
        )
        return
      }
      if (heldMs < MIN_LEADERSHIP_HOLD_MS) {
        this.logger.warn(
          `Leader renew failed but within hold window (${Math.round(heldMs / 1000)}s) — keeping ingestion`,
        )
        return
      }
    }

    const owner = lease?.ownerId ?? null
    this.demoteLeader(owner)
  }

  private async tickAsFollower() {
    if (Date.now() < this.acquireBlockedUntilMs) return

    const lease = await this.readLease()
    if (lease?.ownerId === this.instanceId) {
      this.promoteLeader(this.instanceId)
      return
    }

    if (lease && lease.expiresAtMs > Date.now()) {
      this.leaderId = lease.ownerId
      return
    }

    const value = encodeIngestionLease(this.instanceId, this.leaderTtlSec)
    const acquired = await this.redis.setNx(
      REDIS_KEYS.ingestionLeader,
      value,
      this.leaderTtlSec,
    )
    if (acquired) {
      this.lastLeaseValue = value
      this.leaseExpiresAtMs = parseIngestionLease(value)?.expiresAtMs ?? 0
      this.promoteLeader(this.instanceId)
      return
    }

    const current = await this.readLease()
    if (current?.ownerId === this.instanceId) {
      this.promoteLeader(this.instanceId)
    } else if (current) {
      this.leaderId = current.ownerId
    }
  }

  private async renewWithRetry(): Promise<boolean> {
    const value = encodeIngestionLease(this.instanceId, this.leaderTtlSec)
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = Date.now()
      const ok = await this.redis.renewIngestionLease(
        REDIS_KEYS.ingestionLeader,
        this.instanceId,
        value,
        this.leaderTtlSec,
      )
      this.lastRenewLatencyMs = Date.now() - t0
      if (ok) {
        this.lastRenewAtMs = Date.now()
        this.lastLeaseValue = value
        this.leaseExpiresAtMs = parseIngestionLease(value)?.expiresAtMs ?? 0
        return true
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, RENEW_RETRY_MS * (attempt + 1)))
      }
    }
    return false
  }

  private async readLease() {
    const raw = await this.redis.get(REDIS_KEYS.ingestionLeader)
    return parseIngestionLease(raw)
  }

  private promoteLeader(leaderId: string) {
    if (this.isLeader && this.leaderId === leaderId) return
    this.isLeader = true
    this.leaderId = leaderId
    if (!this.leaderSinceMs) this.leaderSinceMs = Date.now()
    this.consecutiveRenewFailures = 0
    this.acquireBlockedUntilMs = 0
    this.logger.log(`Ingestion leader acquired (${this.instanceId})`)
    this.notify()
  }

  private demoteLeader(leaderId: string | null) {
    if (!this.isLeader) return
    this.isLeader = false
    this.leaderId = leaderId
    this.failoverCount++
    this.leaderSinceMs = 0
    this.leaseExpiresAtMs = 0
    this.lastLeaseValue = null
    this.consecutiveRenewFailures = 0
    this.acquireBlockedUntilMs = Date.now() + ACQUIRE_COOLDOWN_MS
    const ownerLabel = leaderId ?? 'none (lease expired)'
    this.logger.warn(
      `Ingestion leader lost — standing down PumpPortal WS (owner=${ownerLabel}, failovers=${this.failoverCount})`,
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

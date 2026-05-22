import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TokensService } from './tokens.service'
import { EventsGateway } from '../events/events.gateway'

/** Periodically enriches the live feed from pump.fun REST (holders, volume, mcap). */
@Injectable()
export class PumpFeedSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PumpFeedSyncService.name)
  private timer?: NodeJS.Timeout
  private lastSyncAt?: string
  private lastSyncCount = 0

  constructor(
    private config: ConfigService,
    private tokens: TokensService,
    private events: EventsGateway,
  ) {}

  onModuleInit() {
    const ms = Number(this.config.get('PUMP_FUN_SYNC_INTERVAL_MS') ?? 120_000)
    if (!Number.isFinite(ms) || ms < 30_000) return

    this.timer = setInterval(() => void this.runSync(), ms)
    void this.runSync()
    this.logger.log(`pump.fun REST sync every ${Math.round(ms / 1000)}s`)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  getStatus() {
    return {
      intervalMs: Number(this.config.get('PUMP_FUN_SYNC_INTERVAL_MS') ?? 120_000),
      lastSyncAt: this.lastSyncAt,
      lastSyncCount: this.lastSyncCount,
    }
  }

  private async runSync() {
    try {
      const count = await this.tokens.syncFromPump()
      this.lastSyncCount = count
      this.lastSyncAt = new Date().toISOString()
      if (count > 0) {
        const [feed, graduating] = await Promise.all([
          this.tokens.getFeed('all'),
          this.tokens.getGraduatingFeed(),
        ])
        this.events.server?.to('feed').emit('feed:update', feed)
        if (graduating.length > 0) {
          this.events.server?.emit('feed:graduating', graduating)
        }
      }
    } catch (err) {
      this.logger.warn(`pump.fun sync failed: ${(err as Error).message}`)
    }
  }
}

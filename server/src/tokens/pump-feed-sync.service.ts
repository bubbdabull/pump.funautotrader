import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common'
import { PUMP_FUN_SCAN_INTERVAL_MS } from '@phronis/trading'
import { TokensService } from './tokens.service'
import { EventsGateway } from '../events/events.gateway'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'

/** Periodically enriches the live feed from pump.fun REST (holders, volume, mcap). */
@Injectable()
export class PumpFeedSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PumpFeedSyncService.name)
  private timer?: NodeJS.Timeout
  private lastSyncAt?: string
  private lastSyncCount = 0

  constructor(
    private tokens: TokensService,
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    @Inject(forwardRef(() => PumpPortalDataGateway))
    private pumpportal: PumpPortalDataGateway,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runSync(), PUMP_FUN_SCAN_INTERVAL_MS)
    void this.runSync()
    this.logger.log(
      `pump.fun REST sync every ${Math.round(PUMP_FUN_SCAN_INTERVAL_MS / 1000)}s`,
    )
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  getStatus() {
    return {
      intervalMs: PUMP_FUN_SCAN_INTERVAL_MS,
      lastSyncAt: this.lastSyncAt,
      lastSyncCount: this.lastSyncCount,
    }
  }

  private async runSync() {
    try {
      const count = await this.tokens.syncFromPump()
      this.lastSyncCount = count
      this.lastSyncAt = new Date().toISOString()
      const priority = this.tokens.getAutotradePriorityMints()
      for (const mint of priority) {
        this.pumpportal.ensureTradeSubscription(mint)
      }
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

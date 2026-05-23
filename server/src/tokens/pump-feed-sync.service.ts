import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common'
import { PUMP_REST_DISCOVERY_INTERVAL_MS } from '@phronis/trading'
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
    this.timer = setInterval(() => void this.runSync(), PUMP_REST_DISCOVERY_INTERVAL_MS)
    setTimeout(() => void this.runSync(), 15_000)
    this.logger.log(
      `pump.fun REST discovery every ${Math.round(PUMP_REST_DISCOVERY_INTERVAL_MS / 1000)}s (WS is live tape)`,
    )
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  getStatus() {
    return {
      intervalMs: PUMP_REST_DISCOVERY_INTERVAL_MS,
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
        this.logger.log(`REST discovery merged ${count} coins (registry updated)`)
      }
    } catch (err) {
      this.logger.warn(`pump.fun sync failed: ${(err as Error).message}`)
    }
  }
}

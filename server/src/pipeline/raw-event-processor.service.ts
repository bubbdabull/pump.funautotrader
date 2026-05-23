import { Injectable, Inject, Logger, OnModuleInit, forwardRef } from '@nestjs/common'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import type { IngestionEvent } from '../ingestion/ingestion.types'
import { TokenRegistryService } from './token-registry.service'
import { TokensService } from '../tokens/tokens.service'
import { EventsGateway } from '../events/events.gateway'
import { AutoTraderService } from '../autotrader/autotrader.service'
import { HotMintsService } from '../trade-data/hot-mints.service'

/**
 * PumpPortal WS → normalize → registry → scoring → UI.
 * REST never drives live ticks; only enriches discovery in the background.
 */
@Injectable()
export class RawEventProcessorService implements OnModuleInit {
  private readonly logger = new Logger(RawEventProcessorService.name)
  private processed = 0

  constructor(
    private ingestion: IngestionOrchestratorService,
    private registry: TokenRegistryService,
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    private autoTrader: AutoTraderService,
    private hotMints: HotMintsService,
  ) {}

  onModuleInit() {
    this.ingestion.onPostUpdate((mint, event) => void this.process(mint, event))
    this.logger.log('Raw event processor active (stream-first registry)')
  }

  getStats() {
    return { processed: this.processed, registrySize: this.registry.size }
  }

  private async process(mint: string, event: IngestionEvent) {
    this.processed++
    if (
      event.type !== 'token.trade' &&
      event.type !== 'token.launch' &&
      event.type !== 'token.migration'
    ) {
      return
    }

    const whaleSol =
      event.type === 'token.trade' ? Number(event.payload.solAmount ?? 0) : undefined

    const saved = await this.tokens.applyStreamUpdate(mint, {
      isNew: event.type === 'token.launch',
      whaleSol: whaleSol && whaleSol >= 5 ? whaleSol : undefined,
    })

    if (!saved) return

    const normalized = this.registry.normalize(saved, 'stream')
    this.events.emitRegistryPatch(normalized)
    this.tokens.publishStreamEvents(mint, saved)

    if (event.type === 'token.trade') {
      this.hotMints.recordTrade(mint, normalized.lastTradeAt)
      this.autoTrader.onTradeTick(mint)
    }

    if (event.type === 'token.launch') {
      this.autoTrader.pinTradeStream(mint)
      this.events.emitFeedPrepend(normalized)
    }
  }
}

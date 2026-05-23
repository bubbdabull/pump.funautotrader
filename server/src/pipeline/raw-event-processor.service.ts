import { Injectable, Inject, Logger, OnModuleInit, forwardRef } from '@nestjs/common'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import type { IngestionEvent } from '../ingestion/ingestion.types'
import { TokenRegistryService } from './token-registry.service'
import { TokensService } from '../tokens/tokens.service'
import { AutoTraderService } from '../autotrader/autotrader.service'
import { HotMintsService } from '../trade-data/hot-mints.service'
import { StreamIntelligenceService } from '../intelligence/stream-intelligence.service'
import { AnalyticsBatcherService } from '../intelligence/analytics-batcher.service'
import { TerminalEmitterService } from '../intelligence/terminal-emitter.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { RedisCacheHooksService } from '../redis/redis-cache-hooks.service'
import type { DynamicsAnalytics } from '@phronis/trading'

/**
 * PumpPortal WS → normalize → registry → scoring → UI.
 * REST never drives live ticks; only enriches discovery in the background.
 */
@Injectable()
export class RawEventProcessorService implements OnModuleInit {
  private readonly logger = new Logger(RawEventProcessorService.name)
  private processed = 0
  private rejected = 0

  constructor(
    private ingestion: IngestionOrchestratorService,
    private registry: TokenRegistryService,
    private intelligence: StreamIntelligenceService,
    private batcher: AnalyticsBatcherService,
    private liveFeed: LiveFeedService,
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    private autoTrader: AutoTraderService,
    private hotMints: HotMintsService,
    private terminal: TerminalEmitterService,
    private redisHooks: RedisCacheHooksService,
  ) {}

  onModuleInit() {
    this.ingestion.onPostUpdate((mint, event) => void this.process(mint, event))
    this.logger.log('Raw event processor active (stream-first + market dynamics)')
  }

  getStats() {
    return {
      processed: this.processed,
      rejected: this.rejected,
      registrySize: this.registry.size,
    }
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

    const intel = this.intelligence.processEvent(mint, event)
    if (!intel.accepted) {
      this.rejected++
      return
    }

    const whaleSol =
      event.type === 'token.trade' ? Number(event.payload.solAmount ?? 0) : undefined

    const saved = await this.tokens.applyStreamUpdate(mint, {
      isNew: event.type === 'token.launch',
      whaleSol: whaleSol && whaleSol >= 5 ? whaleSol : undefined,
    })

    if (!saved) return

    if (intel.analytics) {
      this.applyDynamicsScores(mint, intel.analytics)
      this.terminal.onDynamics(mint, intel.analytics, saved)
      this.redisHooks.onTradeProcessed(mint, intel.analytics, saved)
    }

    const normalized = this.registry.normalize(saved, 'stream', intel.analytics)
    this.batcher.scheduleRegistryPatch(normalized)
    this.tokens.publishStreamEvents(mint, saved, { skipChartEmit: true })
    this.batcher.scheduleChart(mint)

    if (event.type === 'token.trade') {
      this.hotMints.recordTrade(mint, normalized.lastTradeAt)
      this.autoTrader.onTradeTick(mint)
    }

    if (event.type === 'token.launch') {
      this.autoTrader.pinTradeStream(mint)
    }
  }

  private applyDynamicsScores(mint: string, analytics: DynamicsAnalytics) {
    const row = this.liveFeed.get(mint)
    if (!row) return
    this.liveFeed.patch({
      ...row,
      signalScore: Math.round(analytics.tradeConfidenceScore * 100),
      momentumScore: Math.round(analytics.decayedMomentumScore * 100),
      buyPressure1m: Math.round(analytics.buyPressure1m * 100),
      holders: Math.max(row.holders, analytics.holderEstimate),
    })
  }
}

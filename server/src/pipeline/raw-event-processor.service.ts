import { Injectable, Inject, Logger, OnModuleInit, Optional, forwardRef } from '@nestjs/common'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { IngestionHealthService } from '../ingestion/ingestion-health.service'
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
import { ChartAggregationService } from '../charts/chart-aggregation.service'
import { EventsGateway } from '../events/events.gateway'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'
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
    private chartAgg: ChartAggregationService,
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    @Inject(forwardRef(() => PumpPortalDataGateway))
    private pumpportal: PumpPortalDataGateway,
    @Optional() private ingestionHealth?: IngestionHealthService,
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
    try {
      await this.processSafe(mint, event)
    } catch (err) {
      this.ingestionHealth?.recordProcessError(err)
      this.logger.debug(
        `Raw processor error (${event.type}/${mint.slice(0, 8)}): ${(err as Error).message}`,
      )
    }
  }

  private async processSafe(mint: string, event: IngestionEvent) {
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

    const row = this.liveFeed.get(mint) ?? saved
    const normalized = this.registry.normalize(row, 'stream', intel.analytics)
    const urgentPatch = event.type === 'token.trade'
    this.batcher.scheduleRegistryPatch(normalized, urgentPatch)
    this.tokens.publishStreamEvents(mint, row)

    if (event.type === 'token.trade') {
      const progressionPoint =
        intel.analytics && saved
          ? {
              t: intel.analytics.updatedAt,
              mcap: saved.marketCap,
              curve: saved.bondingCurvePercent,
              volume: intel.analytics.windows.w60.volumeSol,
              holders: Math.max(saved.holders, intel.analytics.holderEstimate),
              score: Math.round(intel.analytics.tradeConfidenceScore * 100),
              momentum: Math.round(intel.analytics.decayedMomentumScore * 100),
              migrationProbability: Math.round(intel.analytics.migration.probability * 100),
              burstIgnition: Math.round(intel.analytics.burst.ignitionScore * 100),
              buyPressure: Math.round(intel.analytics.buyPressure1m * 100),
              volumeVelocity: intel.analytics.velocity.volumeVelocity,
              walletVelocity: intel.analytics.velocity.walletVelocity,
            }
          : undefined

      const chartPayload = this.chartAgg.onTrade(mint, {
        progressionPoint,
        buyPressure: progressionPoint?.buyPressure,
        volumeVelocity: progressionPoint?.volumeVelocity,
        priceVelocity: intel.analytics?.velocity.marketCapVelocity,
      })
      if (chartPayload && this.chartAgg.markEmittedIfDue(mint)) {
        const enriched = {
          ...chartPayload,
          tradeStreamSubscribed: this.pumpportal.isTradeSubscribed(mint),
          pumpportalKeyConfigured: this.pumpportal.getHealth().apiKeyConfigured,
        }
        this.events.emitChartDelta(enriched)
      }
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
      migrationProbability: Math.round(analytics.migration.probability * 100),
      burstIgnition: Math.round(analytics.burst.ignitionScore * 100),
      holders: Math.max(row.holders, analytics.holderEstimate),
      isActive: true,
      lastTradeAt: analytics.updatedAt,
      trades1m: analytics.windows.w60.tradeCount,
      volume5mSol: analytics.windows.w30.volumeSol,
    })
  }
}

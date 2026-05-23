import { Injectable, Inject, Logger, OnModuleInit, Optional, forwardRef } from '@nestjs/common'
import { EventBusService } from '../ingestion/event-bus.service'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { IngestionHealthService } from '../ingestion/ingestion-health.service'
import type { IngestionEvent } from '../ingestion/ingestion.types'
import { TokenRegistryService } from '../pipeline/token-registry.service'
import { TokensService } from '../tokens/tokens.service'
import { AutoTraderService } from '../autotrader/autotrader.service'
import { HotMintsService } from '../trade-data/hot-mints.service'
import { StreamIntelligenceService } from '../intelligence/stream-intelligence.service'
import { TerminalEmitterService } from '../intelligence/terminal-emitter.service'
import { RedisCacheHooksService } from '../redis/redis-cache-hooks.service'
import { ChartAggregationService } from '../charts/chart-aggregation.service'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'
import type { DynamicsAnalytics } from '@phronis/trading'
import { SignalIntelligenceService } from '../intelligence/signal-intelligence.service'
import { SnapshotService } from './snapshot.service'
import { WebSocketBroadcasterService } from './websocket-broadcaster.service'
/**
 * Processing layer — registry, scoring, snapshot updates, broadcast scheduling.
 * Never runs inside PumpPortal WS handlers.
 */
@Injectable()
export class ProcessingWorkerService implements OnModuleInit {
  private readonly logger = new Logger(ProcessingWorkerService.name)
  private processed = 0
  private rejected = 0

  constructor(
    private bus: EventBusService,
    private orchestrator: IngestionOrchestratorService,
    private registry: TokenRegistryService,
    private snapshot: SnapshotService,
    private intelligence: StreamIntelligenceService,
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    private autoTrader: AutoTraderService,
    private hotMints: HotMintsService,
    private terminal: TerminalEmitterService,
    private redisHooks: RedisCacheHooksService,
    private chartAgg: ChartAggregationService,
    @Inject(forwardRef(() => PumpPortalDataGateway))
    private pumpportal: PumpPortalDataGateway,
    private signalIntel: SignalIntelligenceService,
    private broadcaster: WebSocketBroadcasterService,
    @Optional() private ingestionHealth?: IngestionHealthService,
  ) {}

  onModuleInit() {
    this.bus.subscribeProcessing((batch) => void this.handleBatch(batch))
    this.logger.log('Processing worker subscribed to ingestion bus')
  }

  getStats() {
    return {
      processed: this.processed,
      rejected: this.rejected,
      registrySize: this.registry.size,
    }
  }

  private async handleBatch(batch: IngestionEvent[]) {
    for (const event of batch) {
      try {
        this.orchestrator.applyTradingState(event)
        await this.processStream(event.mint, event)
      } catch (err) {
        this.ingestionHealth?.recordProcessError(err)
        this.logger.debug(
          `Processing error (${event.type}/${event.mint?.slice(0, 8)}): ${(err as Error).message}`,
        )
      }
    }
  }

  private async processStream(mint: string, event: IngestionEvent) {
    this.processed++
    if (
      event.type !== 'token.trade' &&
      event.type !== 'token.launch' &&
      event.type !== 'token.migration'
    ) {
      return
    }

    if (event.type === 'token.migration') {
      const live = this.snapshot.get(mint)
      if (live) {
        this.tokens.upsertLiveToken({ ...live, bondingCurvePercent: 100 })
      }
      this.autoTrader.pinTradeStream(mint)
      this.pumpportal.ensureTradeSubscription(mint)
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
      setImmediate(() => {
        try {
          this.terminal.onDynamics(mint, intel.analytics!, saved)
          this.redisHooks.onTradeProcessed(mint, intel.analytics!, saved)
        } catch {
          /* non-fatal */
        }
      })
    }

    const row = this.snapshot.get(mint) ?? saved
    const enriched = this.signalIntel.enrichFeedToken(row, intel.analytics ?? undefined)
    this.snapshot.patch(enriched)
    const normalized = this.registry.normalize(enriched, 'stream', intel.analytics)
    this.broadcaster.scheduleRegistryPatch(normalized, event.type === 'token.trade')

    const alerts = this.signalIntel.evaluateAlerts(mint, enriched, 'pro')
    for (const alert of alerts) {
      this.broadcaster.emitIntelligenceAlert(alert)
    }

    setImmediate(() => {
      try {
        this.tokens.publishStreamEvents(mint, saved)
      } catch {
        /* non-fatal */
      }
    })

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
              momentumPulse:
                intel.analytics.burst.ignitionScore > 0.35 ||
                intel.analytics.velocity.volumeVelocity > 2,
            }
          : undefined

      const chartPayload = this.chartAgg.onTrade(mint, {
        progressionPoint,
        buyPressure: progressionPoint?.buyPressure,
        volumeVelocity: progressionPoint?.volumeVelocity,
        priceVelocity: intel.analytics?.velocity.marketCapVelocity,
      })
      if (chartPayload && this.chartAgg.markEmittedIfDue(mint)) {
        this.broadcaster.emitChartDelta({
          ...chartPayload,
          tradeStreamSubscribed: this.pumpportal.isTradeSubscribed(mint),
          pumpportalKeyConfigured: this.pumpportal.getHealth().apiKeyConfigured,
        })
      }
      this.hotMints.recordTrade(mint, normalized.lastTradeAt)
      setImmediate(() => {
        try {
          this.autoTrader.onTradeTick(mint)
        } catch {
          /* non-fatal */
        }
      })
    }

    if (event.type === 'token.launch') {
      this.autoTrader.pinTradeStream(mint)
    }

    this.orchestrator.notifyPostUpdate(mint, event)
  }

  private applyDynamicsScores(mint: string, analytics: DynamicsAnalytics) {
    const row = this.snapshot.get(mint)
    if (!row) return
    this.snapshot.patch({
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

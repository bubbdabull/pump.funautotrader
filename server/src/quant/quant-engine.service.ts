import { Injectable, Inject, Logger, OnModuleInit, forwardRef } from '@nestjs/common'
import {
  globalMarketState,
  computeQuantitativeScores,
  computeRugScore,
  evaluateAllStrategies,
  globalRiskManager,
  clamp01,
  resolveHolderCount,
  HOLDER_ON_TRADE_REFRESH_MS,
} from '@phronis/trading'
import { EventsGateway } from '../events/events.gateway'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { QuantPersistService } from './quant-persist.service'
import { PersistenceQueueService } from '../persistence/persistence-queue.service'
import { HolderEnrichmentService } from '../holders/holder-enrichment.service'
import { MarketDynamicsService } from '../intelligence/market-dynamics.service'
import { SignalAttributionService } from '../intelligence/signal-attribution.service'
import { TerminalEmitterService } from '../intelligence/terminal-emitter.service'
import { RedisCacheHooksService } from '../redis/redis-cache-hooks.service'

@Injectable()
export class QuantEngineService implements OnModuleInit {
  private readonly logger = new Logger(QuantEngineService.name)
  private readonly rankings = new Map<string, number>()
  private readonly holderCounts = new Map<string, number>()
  private readonly holderRefreshAt = new Map<string, number>()

  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    private ingestion: IngestionOrchestratorService,
    private quantPersist: QuantPersistService,
    private persistQueue: PersistenceQueueService,
    private dynamics: MarketDynamicsService,
    private attribution: SignalAttributionService,
    private terminal: TerminalEmitterService,
    private redisHooks: RedisCacheHooksService,
    @Inject(forwardRef(() => HolderEnrichmentService))
    private holderEnrichment: HolderEnrichmentService,
  ) {}

  onModuleInit() {
    globalMarketState.onStrategySignal((mint, signal) => {
      this.events.server?.emit('quant:strategy', { mint, signal })
    })
    this.ingestion.onPostUpdate((mint) => {
      void this.onMarketUpdate(mint)
    })
  }

  async onMarketUpdate(mint: string) {
    const state = globalMarketState.getState(mint)
    if (!state) return null

    const scores = computeQuantitativeScores(state)
    const rug = computeRugScore(state)
    const analytics = this.dynamics.getAnalytics(mint, rug.blocked)
    const strategies = evaluateAllStrategies(state)
    const risk = globalRiskManager.canOpenTrade()

    const holders = resolveHolderCount({
      walletBalances: state.walletBalances,
      trades: state.trades,
      onChainHolders: state.onChainHolders,
    })
    const lastRefresh = this.holderRefreshAt.get(mint) ?? 0
    if (Date.now() - lastRefresh >= HOLDER_ON_TRADE_REFRESH_MS) {
      this.holderRefreshAt.set(mint, Date.now())
      void this.holderEnrichment.enrichMint(mint)
    }

    const legacyConf = scores.tradeConfidenceScore / 100
    const dynamicsConf = analytics?.tradeConfidenceScore ?? 0
    const blended = analytics
      ? clamp01(dynamicsConf * 0.68 + legacyConf * 0.32)
      : legacyConf
    const blendedPct = Math.round(blended * 100)

    this.rankings.set(mint, blendedPct)
    this.holderCounts.set(mint, holders)

    if (analytics) {
      const triggerReasons = [
        ...analytics.migration.drivers,
        ...(analytics.burst.ignitionScore > 0.55 ? ['burst_ignition'] : []),
        ...(analytics.velocity.volumeAcceleration > 0.2 ? ['volume_accel'] : []),
      ]
      const riskPenalties: string[] = []
      if (analytics.coordinationPenalty > 0.2) {
        riskPenalties.push(`coordination_${Math.round(analytics.coordinationPenalty * 100)}`)
      }
      if (rug.rugScore > 50) riskPenalties.push(`rug_${rug.rugScore}`)

      const entry = this.attribution.record({
        analytics,
        rug,
        triggerReasons,
        riskPenalties,
        legacyScores: {
          tradeConfidence: blendedPct,
          momentum: Math.round(
            (analytics.decayedMomentumScore * 0.7 + scores.momentumScore * 0.3) * 100,
          ),
        },
      })
      this.terminal.onSignal(mint, analytics, rug, entry)
      this.redisHooks.onMarketScored(mint, analytics, blendedPct, rug)
    }

    const payload = {
      mint,
      scores: {
        ...scores,
        tradeConfidenceScore: blendedPct,
        momentumScore: analytics
          ? Math.round(
              (analytics.decayedMomentumScore * 0.7 + scores.momentumScore * 0.3) * 100,
            )
          : Math.round(scores.momentumScore * 100),
      },
      rug,
      strategies: strategies.slice(0, 3),
      risk,
      holders,
      holdersVerified: Boolean(state.onChainHolders?.verified),
      dynamics: analytics
        ? {
            lifecycle: analytics.lifecycle,
            migrationProbability: Math.round(analytics.migration.probability * 100),
            burst: analytics.burst,
            velocity: analytics.velocity,
            coordinationPenalty: analytics.coordinationPenalty,
          }
        : undefined,
      at: new Date().toISOString(),
    }

    if (this.quantPersist.shouldPersist(mint)) {
      this.persistQueue.enqueue({
        type: 'quant_snapshot',
        mint,
        scores: payload.scores,
        rug,
      })
    }

    this.events.server?.emit('quant:update', payload)
    if (rug.blocked) {
      this.events.server?.emit('quant:rug_warning', { mint, rug })
    }

    return payload
  }

  getRankings(limit = 50) {
    const fromDynamics = this.dynamics.getRankings(limit)
    if (fromDynamics.length >= limit * 0.5) {
      return fromDynamics.map((a) => ({
        mint: a.mint,
        confidence: Math.round(a.tradeConfidenceScore * 100),
      }))
    }
    return [...this.rankings.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([mint, confidence]) => ({ mint, confidence }))
  }

  analyzeMint(mint: string) {
    const state = globalMarketState.getState(mint)
    if (!state) return null
    const analytics = this.dynamics.getAnalytics(mint)
    return {
      mint,
      scores: computeQuantitativeScores(state),
      rug: computeRugScore(state),
      strategies: evaluateAllStrategies(state),
      risk: globalRiskManager.getState(),
      dynamics: analytics,
      holders: resolveHolderCount({
        walletBalances: state.walletBalances,
        trades: state.trades,
        onChainHolders: state.onChainHolders,
      }),
    }
  }

  getHolderCount(mint: string): number | undefined {
    return this.holderCounts.get(mint)
  }
}

import { Injectable, Inject, Logger, OnModuleInit, forwardRef } from '@nestjs/common'
import {
  globalMarketState,
  computeQuantitativeScores,
  computeRugScore,
  evaluateAllStrategies,
  globalRiskManager,
} from '@phronis/trading'
import { EventsGateway } from '../events/events.gateway'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { QuantPersistService } from './quant-persist.service'
import { resolveHolderCount } from '@phronis/trading'
import { HolderEnrichmentService } from '../holders/holder-enrichment.service'

@Injectable()
export class QuantEngineService implements OnModuleInit {
  private readonly logger = new Logger(QuantEngineService.name)
  private readonly rankings = new Map<string, number>()
  private readonly holderCounts = new Map<string, number>()

  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    private ingestion: IngestionOrchestratorService,
    private persist: QuantPersistService,
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
    const strategies = evaluateAllStrategies(state)
    const risk = globalRiskManager.canOpenTrade()

    const holders = resolveHolderCount({
      walletBalances: state.walletBalances,
      trades: state.trades,
      onChainHolders: state.onChainHolders,
    })
    void this.holderEnrichment.enrichMint(mint)
    this.rankings.set(mint, scores.tradeConfidenceScore)
    this.holderCounts.set(mint, holders)

    const payload = {
      mint,
      scores,
      rug,
      strategies: strategies.slice(0, 3),
      risk,
      holders,
      holdersVerified: Boolean(state.onChainHolders?.verified),
      at: new Date().toISOString(),
    }

    void this.persist.persist(mint, scores, rug)

    this.events.server?.emit('quant:update', payload)
    if (rug.blocked) {
      this.events.server?.emit('quant:rug_warning', { mint, rug })
    }

    return payload
  }

  getRankings(limit = 50) {
    return [...this.rankings.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([mint, confidence]) => ({ mint, confidence }))
  }

  analyzeMint(mint: string) {
    const state = globalMarketState.getState(mint)
    if (!state) return null
    return {
      mint,
      scores: computeQuantitativeScores(state),
      rug: computeRugScore(state),
      strategies: evaluateAllStrategies(state),
      risk: globalRiskManager.getState(),
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

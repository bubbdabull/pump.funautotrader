import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common'
import type { DynamicsAnalytics, RugScoreBreakdown, SignalAttributionRecord, TokenLifecycleState } from '@phronis/trading'
import type { OnChainHolderSnapshot, WalletRelationshipGraph } from '@phronis/trading'
import { EventsGateway } from '../events/events.gateway'
import type { ProgressionPoint } from '../events/terminal-payloads'
import type { FeedToken } from '../feed/feed.types'

@Injectable()
export class TerminalEmitterService {
  private readonly logger = new Logger(TerminalEmitterService.name)
  private readonly lastLifecycle = new Map<string, TokenLifecycleState>()
  private readonly progression = new Map<string, ProgressionPoint[]>()
  private readonly lastSignalEmit = new Map<string, number>()
  private readonly signalThrottleMs = 3_000

  constructor(
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
  ) {}

  getProgression(mint: string): ProgressionPoint[] {
    return this.progression.get(mint) ?? []
  }

  onDynamics(mint: string, analytics: DynamicsAnalytics, token?: FeedToken) {
    const prev = this.lastLifecycle.get(mint)
    if (prev && prev !== analytics.lifecycle) {
      this.events.emitTokenStateChange({
        mint,
        from: prev,
        to: analytics.lifecycle,
        at: new Date().toISOString(),
      })
    }
    this.lastLifecycle.set(mint, analytics.lifecycle)

    this.appendProgression(mint, analytics, token)

    if (
      analytics.lifecycle === 'MIGRATION_WATCH' ||
      analytics.lifecycle === 'MIGRATED' ||
      analytics.migration.probability > 0.55
    ) {
      this.events.emitMigrationUpdate({
        mint,
        probability: Math.round(analytics.migration.probability * 100),
        confidence: Math.round(analytics.migration.confidence * 100),
        bondingCurvePercent: token?.bondingCurvePercent ?? 0,
        lifecycle: analytics.lifecycle,
        drivers: analytics.migration.drivers,
        at: new Date().toISOString(),
      })
    }
  }

  onSignal(
    mint: string,
    analytics: DynamicsAnalytics,
    rug: RugScoreBreakdown,
    attribution: SignalAttributionRecord,
  ) {
    const last = this.lastSignalEmit.get(mint) ?? 0
    if (Date.now() - last < this.signalThrottleMs) return
    this.lastSignalEmit.set(mint, Date.now())

    this.events.emitSignalUpdate({
      mint,
      tradeConfidenceScore: attribution.tradeConfidenceScore,
      momentumScore: attribution.momentumScore,
      migrationProbability: attribution.migrationProbability,
      burstIgnition: Math.round(analytics.burst.ignitionScore * 100),
      coordinationPenalty: Math.round(analytics.coordinationPenalty * 100),
      lifecycle: analytics.lifecycle,
      velocity: analytics.velocity,
      burst: analytics.burst,
      riskPenalties: attribution.riskPenalties,
      triggerReasons: attribution.triggerReasons,
      rug: {
        rugScore: rug.rugScore,
        blocked: rug.blocked,
        fakeVolumeProbability: rug.fakeVolumeProbability,
      },
      at: new Date().toISOString(),
    })
  }

  onHolder(mint: string, snap: OnChainHolderSnapshot, holders: number, verified: boolean) {
    this.events.emitHolderUpdate({
      mint,
      holders,
      holdersVerified: verified,
      top1Pct: snap.top1Pct,
      top5Pct: snap.top5Pct,
      entropy: snap.entropy,
      suspiciousClusterPct: snap.suspiciousClusterPct,
      at: new Date().toISOString(),
    })
  }

  onWalletGraph(mint: string, graph: WalletRelationshipGraph) {
    this.events.emitWalletUpdate({ mint, graph, at: new Date().toISOString() })
    this.events.emitBubbleMapUpdate({
      mint,
      graph,
      at: new Date().toISOString(),
    })
  }

  private appendProgression(mint: string, analytics: DynamicsAnalytics, token?: FeedToken) {
    const w60 = analytics.windows.w60
    const point: ProgressionPoint = {
      t: analytics.updatedAt,
      mcap: token?.marketCap ?? w60.mcapEnd,
      curve: token?.bondingCurvePercent ?? 0,
      volume: w60.volumeSol,
      holders: Math.max(token?.holders ?? 0, analytics.holderEstimate),
      score: Math.round(analytics.tradeConfidenceScore * 100),
      momentum: Math.round(analytics.decayedMomentumScore * 100),
      migrationProbability: Math.round(analytics.migration.probability * 100),
      burstIgnition: Math.round(analytics.burst.ignitionScore * 100),
      buyPressure: Math.round(analytics.buyPressure1m * 100),
      volumeVelocity: analytics.velocity.volumeVelocity,
      walletVelocity: analytics.velocity.walletVelocity,
    }
    let arr = this.progression.get(mint) ?? []
    const last = arr[arr.length - 1]
    if (last && last.t === point.t) {
      arr[arr.length - 1] = point
    } else {
      arr = [...arr, point]
    }
    if (arr.length > 120) arr = arr.slice(-120)
    this.progression.set(mint, arr)
  }
}

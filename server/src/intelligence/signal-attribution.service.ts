import { Injectable, Logger } from '@nestjs/common'
import {
  SIGNAL_ATTRIBUTION_MAX_PER_MINT,
  type DynamicsAnalytics,
  type SignalAttributionRecord,
  type RugScoreBreakdown,
} from '@phronis/trading'
import { PersistenceQueueService } from '../persistence/persistence-queue.service'

@Injectable()
export class SignalAttributionService {
  private readonly logger = new Logger(SignalAttributionService.name)
  private readonly byMint = new Map<string, SignalAttributionRecord[]>()

  constructor(private persistQueue: PersistenceQueueService) {}

  record(params: {
    analytics: DynamicsAnalytics
    rug: RugScoreBreakdown
    triggerReasons: string[]
    riskPenalties: string[]
    legacyScores?: { tradeConfidence: number; momentum: number }
  }): SignalAttributionRecord {
    const { analytics, rug, triggerReasons, riskPenalties, legacyScores } = params
    const entry: SignalAttributionRecord = {
      id: `${analytics.mint}-${analytics.updatedAt}`,
      mint: analytics.mint,
      timestampMs: analytics.updatedAt,
      tradeConfidenceScore:
        legacyScores?.tradeConfidence ??
        Math.round(analytics.tradeConfidenceScore * 100),
      momentumScore:
        legacyScores?.momentum ?? Math.round(analytics.decayedMomentumScore * 100),
      migrationProbability: Math.round(analytics.migration.probability * 100),
      velocity: analytics.velocity,
      burst: analytics.burst,
      coordinationPenalty: analytics.coordinationPenalty,
      walletGrowth: analytics.holderEstimate,
      riskPenalties: [...riskPenalties, ...(rug.blocked ? ['rug_blocked'] : [])],
      triggerReasons,
      lifecycle: analytics.lifecycle,
      outcome: 'pending',
    }

    let list = this.byMint.get(analytics.mint)
    if (!list) {
      list = []
      this.byMint.set(analytics.mint, list)
    }
    list.push(entry)
    if (list.length > SIGNAL_ATTRIBUTION_MAX_PER_MINT) {
      list.splice(0, list.length - SIGNAL_ATTRIBUTION_MAX_PER_MINT)
    }

    this.persistQueue.enqueue({ type: 'signal_attribution', entry })
    return entry
  }

  getHistory(mint: string, limit = 40): SignalAttributionRecord[] {
    const list = this.byMint.get(mint) ?? []
    return list.slice(-limit)
  }
}

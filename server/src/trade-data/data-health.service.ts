import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SupabaseDbService } from '../supabase/supabase-db.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { FeedTradePinService } from './feed-trade-pin.service'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'

export type PumpPortalStatusSnapshot = {
  connected: boolean
  apiKeyConfigured: boolean
  tradeSubscriptionsEnabled: boolean
  maxTradeSubscriptions: number
  subscribedTradeMints: number
  pendingTradeSubscriptions: number
  pinnedPriorityMints: number
  liveFeedCount: number
  messagesReceived: number
  tradeMessagesReceived?: number
  lastMessageAt?: string
  lastTradeSubRotationAt?: string
}

export interface DataHealthReport {
  ok: boolean
  grade: 'good' | 'degraded' | 'poor'
  issues: string[]
  pumpportal: PumpPortalStatusSnapshot
  ingestion: ReturnType<IngestionOrchestratorService['getStats']>
  supabase: boolean
  helius: boolean
  feed: {
    size: number
    coverage: ReturnType<FeedTradePinService['coverageStats']>
  }
  db: {
    tradesLast5m: number
    activeTokensLast2m: number
  }
  at: string
}

@Injectable()
export class DataHealthService {
  private readonly logger = new Logger(DataHealthService.name)

  constructor(
    private config: ConfigService,
    private supabase: SupabaseDbService,
    private liveFeed: LiveFeedService,
    private feedPin: FeedTradePinService,
    private ingestion: IngestionOrchestratorService,
  ) {}

  async getReport(pumpStatus: PumpPortalStatusSnapshot): Promise<DataHealthReport> {
    const issues: string[] = []
    const feed = this.liveFeed.getAll()
    const coverage = this.feedPin.coverageStats(feed)

    const tradeMsgs = pumpStatus.tradeMessagesReceived ?? 0
    if (!this.config.get('PUMPPORTAL_API_KEY')?.trim()) {
      issues.push('PUMPPORTAL_API_KEY missing — no live trade ticks')
    } else if (!pumpStatus.connected) {
      issues.push('PumpPortal WebSocket disconnected')
    } else if (pumpStatus.subscribedTradeMints < 10) {
      issues.push(`Only ${pumpStatus.subscribedTradeMints} trade subscriptions active`)
    } else if (tradeMsgs < 5 && pumpStatus.messagesReceived > 100) {
      issues.push(
        `Almost no trade ticks parsed (${tradeMsgs} trades / ${pumpStatus.messagesReceived} WS msgs) — check PumpPortal wallet balance`,
      )
    }

    if (!this.config.get('HELIUS_API_KEY')?.trim()) {
      issues.push('HELIUS_API_KEY missing — holder counts unverified')
    }

    if (!this.supabase.enabled) {
      issues.push('Supabase not connected — trades not persisted')
    }

    const feedLive = coverage.feedWithRecentTrade
    const feedSize = Math.max(1, coverage.feedSize)
    const liveRatio = feedLive / feedSize

    if (liveRatio < 0.1 && feedSize >= 10) {
      issues.push(
        `Low scanner live rate: ${feedLive}/${feedSize} feed tokens traded in last 2m`,
      )
    } else if (
      coverage.mandatoryInFeed > 0 &&
      coverage.mandatoryWithRecentTrade / coverage.mandatoryInFeed < 0.12
    ) {
      issues.push(
        `Few pinned tokens trading: ${coverage.mandatoryWithRecentTrade}/${coverage.mandatoryInFeed} in feed active`,
      )
    }

    const now = Date.now()
    let tradesLast5m = 0
    let activeTokensLast2m = 0
    if (this.supabase.enabled) {
      try {
        tradesLast5m = await this.supabase.countRecentTrades(now - 5 * 60_000)
        activeTokensLast2m = await this.supabase.countActiveTokens(now - 2 * 60_000)
      } catch (err) {
        this.logger.debug(`Data health DB counts: ${(err as Error).message}`)
      }
    }
    const db = { tradesLast5m, activeTokensLast2m }

    let grade: DataHealthReport['grade'] = 'good'
    if (issues.length >= 3 || !pumpStatus.connected) grade = 'poor'
    else if (issues.length > 0) grade = 'degraded'

    return {
      ok: grade !== 'poor',
      grade,
      issues,
      pumpportal: pumpStatus,
      ingestion: this.ingestion.getStats(),
      supabase: this.supabase.enabled,
      helius: Boolean(this.config.get('HELIUS_API_KEY')?.trim()),
      feed: { size: feed.length, coverage },
      db,
      at: new Date().toISOString(),
    }
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common'
import { passesTradeableFilter } from '@phronis/trading'
import { computeFeedActivity, type FeedActivityFields } from '@phronis/trading'
import { SupabaseDbService } from '../supabase/supabase-db.service'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { HotMintsService } from './hot-mints.service'
@Injectable()
export class TradePersistService implements OnModuleInit {
  private readonly activityThrottle = new Map<string, number>()
  private readonly activityThrottleMs = 2_000

  constructor(
    private supabase: SupabaseDbService,
    private ingestion: IngestionOrchestratorService,
    private trading: TradingBridgeService,
    private liveFeed: LiveFeedService,
    private hotMints: HotMintsService,
  ) {}

  onModuleInit() {
    this.ingestion.onPostUpdate((mint, event) => {
      if (event.type === 'token.trade') void this.onTrade(mint)
    })
  }

  private shouldPatchActivity(mint: string): boolean {
    const last = this.activityThrottle.get(mint) ?? 0
    if (Date.now() - last < this.activityThrottleMs) return false
    this.activityThrottle.set(mint, Date.now())
    return true
  }

  private async onTrade(mint: string) {
    const state = this.trading.getState(mint)
    if (!state?.trades.length) return

    const last = state.trades[state.trades.length - 1]
    this.hotMints.recordTrade(mint, last.timestamp)
    const activity = computeFeedActivity(state)
    let feedToken = this.liveFeed.get(mint)
    if (feedToken) {
      this.liveFeed.upsert({
        ...feedToken,
        ...activity,
        marketCap: state.marketCapUsd || feedToken.marketCap,
        bondingCurvePercent: state.bondingCurvePercent,
        volume24h: Math.max(
          feedToken.volume24h,
          state.trades.reduce((a, t) => a + t.solAmount, 0),
        ),
      })
    }

    if (!this.supabase.enabled) return

    const inFeed = Boolean(feedToken)
    if (!inFeed && state.trades.length < 3) return

    await this.supabase.insertWalletActivityOnce(mint, {
      wallet: last.wallet,
      side: last.side,
      solAmount: last.solAmount,
      signature: last.signature,
      slot: last.slot,
      timestamp: last.timestamp,
    })

    if (!this.shouldPatchActivity(mint)) return

    feedToken = this.liveFeed.get(mint) ?? feedToken

    await this.supabase.patchTokenLiveActivity(mint, activity, {
      marketCap: state.marketCapUsd,
      bondingCurvePercent: state.bondingCurvePercent,
      volume24h: state.trades.reduce((a, t) => a + t.solAmount, 0),
    })

    if (feedToken) {
      const enriched = {
        ...feedToken,
        ...activity,
        marketCap: state.marketCapUsd || feedToken.marketCap,
        bondingCurvePercent: state.bondingCurvePercent,
        volume24h: Math.max(
          feedToken.volume24h,
          state.trades.reduce((a, t) => a + t.solAmount, 0),
        ),
      }
      const saved = this.liveFeed.upsert(enriched)
      if (saved && passesTradeableFilter(saved)) {
        void this.supabase.upsertToken(saved)
      }
    }
  }
}

import { Injectable, Inject, OnModuleInit, forwardRef } from '@nestjs/common'
import { computeFeedActivity } from '@phronis/trading'
import { SupabaseDbService } from '../supabase/supabase-db.service'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { HotMintsService } from './hot-mints.service'
import { TokensService } from '../tokens/tokens.service'
import { AutoTraderService } from '../autotrader/autotrader.service'
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
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    private autoTrader: AutoTraderService,
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
    void this.tokens.emitFeedPatch(mint)
    this.autoTrader.onTradeTick(mint)

    if (!this.supabase.enabled) return

    const inFeed = Boolean(feedToken)
    const hot = this.hotMints.getHotMints(80).includes(mint)
    if (!inFeed && !hot && state.trades.length < 2) return

    feedToken = feedToken ?? this.liveFeed.get(mint)
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
      feedToken = this.liveFeed.patch(enriched) ?? enriched
      void this.tokens.persistFeedToken(feedToken)
    }

    await this.supabase.insertWalletActivityOnce(mint, {
      wallet: last.wallet,
      side: last.side,
      solAmount: last.solAmount,
      signature: last.signature,
      slot: last.slot,
      timestamp: last.timestamp,
    })

    if (!this.shouldPatchActivity(mint)) return

    await this.supabase.patchTokenLiveActivity(mint, activity, {
      marketCap: state.marketCapUsd,
      bondingCurvePercent: state.bondingCurvePercent,
      volume24h: state.trades.reduce((a, t) => a + t.solAmount, 0),
    })
  }
}

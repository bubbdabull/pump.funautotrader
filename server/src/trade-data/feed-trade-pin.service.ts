import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LiveFeedService } from '../feed/live-feed.service'
import { AutoTraderService } from '../autotrader/autotrader.service'
import { filterForLane, passesTradeableFilter, passesAlphaFilter } from '@phronis/trading'
import type { FeedToken } from '../feed/feed.types'

/** Mints that must keep PumpPortal trade streams (visible feed + user pins). */
@Injectable()
export class FeedTradePinService {
  private readonly maxPins: number

  constructor(
    private liveFeed: LiveFeedService,
    private autoTrader: AutoTraderService,
    config: ConfigService,
  ) {
    const n = Number(config.get('FEED_TRADE_PIN_MAX') ?? 120)
    this.maxPins = Number.isFinite(n) && n >= 20 ? Math.min(n, 300) : 120
  }

  getMandatoryMints(): string[] {
    const pinned = new Set(this.autoTrader.getPriorityMints())
    const feed = this.liveFeed.getAll(this.maxPins * 2)

    const tradeable = filterForLane(feed, 'tradeable').map((t) => t.mint)
    const alpha = feed.filter(passesAlphaFilter).map((t) => t.mint)
    const graduating = feed
      .filter((t) => t.bondingCurvePercent >= 78 && t.bondingCurvePercent < 100)
      .map((t) => t.mint)

    const ordered: string[] = []
    const seen = new Set<string>()
    const push = (mint: string) => {
      if (!mint || seen.has(mint)) return
      seen.add(mint)
      ordered.push(mint)
    }

    for (const m of pinned) push(m)
    for (const m of tradeable) push(m)
    for (const m of alpha) push(m)
    for (const m of graduating) push(m)

    return ordered.slice(0, this.maxPins)
  }

  /** Pin every tradeable token currently shown in feed lanes. */
  refreshPinsFromFeed() {
    const feed = this.liveFeed.getAll()
    for (const t of feed) {
      if (passesTradeableFilter(t) || passesAlphaFilter(t) || t.bondingCurvePercent >= 78) {
        this.autoTrader.pinTradeStream(t.mint)
      }
    }
  }

  coverageStats(feed: FeedToken[]) {
    const mandatory = new Set(this.getMandatoryMints())
    const withActivity = feed.filter((t) => t.isActive || (t.lastTradeAt && Date.now() - t.lastTradeAt < 120_000))
    const mandatoryInFeed = feed.filter((t) => mandatory.has(t.mint))
    const mandatoryActive = mandatoryInFeed.filter(
      (t) => t.isActive || (t.lastTradeAt && Date.now() - t.lastTradeAt < 120_000),
    )
    return {
      feedSize: feed.length,
      mandatoryCount: mandatory.size,
      mandatoryInFeed: mandatoryInFeed.length,
      mandatoryWithRecentTrade: mandatoryActive.length,
      feedWithRecentTrade: withActivity.length,
    }
  }
}

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  normalizeVirtualSol,
  passesAlphaFilter,
  tradeQualityScore,
} from '@phronis/trading'
import type { FeedToken, FeedStats } from './feed.types'

@Injectable()
export class LiveFeedService {
  private readonly maxFeed: number
  private readonly tokens = new Map<string, FeedToken>()

  constructor(config: ConfigService) {
    const n = Number(config.get('LIVE_FEED_MAX') ?? 80)
    this.maxFeed = Number.isFinite(n) && n >= 20 ? Math.min(n, 500) : 80
  }

  getMaxFeed(): number {
    return this.maxFeed
  }

  /** Watchlist-quality tokens stored; tradeable lane filters on read after holder enrich. */
  shouldStore(token: FeedToken): boolean {
    return passesAlphaFilter(token)
  }

  upsert(token: FeedToken): FeedToken | null {
    if (!this.shouldStore(token)) {
      return null
    }
    const prev = this.tokens.get(token.mint)
    const merged: FeedToken = prev
      ? {
          ...prev,
          ...token,
          holders: Math.max(prev.holders, token.holders),
          holdersVerified: prev.holdersVerified || token.holdersVerified,
          volume24h: Math.max(prev.volume24h, token.volume24h),
          launchedAt: prev.launchedAt || token.launchedAt,
        }
      : token
    this.tokens.set(token.mint, merged)
    this.trim()
    return merged
  }

  mergeBootstrap(tokens: FeedToken[]) {
    for (const t of tokens) {
      if (!this.shouldStore(t)) continue
      const prev = this.tokens.get(t.mint)
      this.tokens.set(
        t.mint,
        prev
          ? {
              ...t,
              ...prev,
              holders: Math.max(prev.holders, t.holders),
              holdersVerified: prev.holdersVerified || t.holdersVerified,
              volume24h: Math.max(prev.volume24h, t.volume24h),
            }
          : t,
      )
    }
    this.trim()
  }

  get(mint: string): FeedToken | undefined {
    return this.tokens.get(mint)
  }

  getAll(limit = this.maxFeed * 4): FeedToken[] {
    return [...this.tokens.values()]
      .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
      .slice(0, limit)
  }

  getStats(): FeedStats {
    const all = this.getAll(500)
    const hourAgo = Date.now() - 60 * 60 * 1000
    const newTokensLastHour = all.filter((t) => new Date(t.launchedAt).getTime() > hourAgo).length
    const totalVolume24h = all.reduce((s, t) => {
      const vol = t.volume24h > 0 ? t.volume24h : normalizeVirtualSol(t.liquidity)
      return s + vol
    }, 0)
    const totalMarketCap = all.reduce((s, t) => s + t.marketCap, 0)
    const avgSignalScore =
      all.length > 0 ? all.reduce((s, t) => s + t.signalScore, 0) / all.length : 0

    return {
      activeTokens: all.length,
      totalVolume24h,
      totalMarketCap,
      newTokensLastHour,
      avgSignalScore: Math.round(avgSignalScore),
    }
  }

  private trim() {
    if (this.tokens.size <= this.maxFeed) return
    const sorted = this.getAll(this.maxFeed)
    this.tokens.clear()
    for (const t of sorted) this.tokens.set(t.mint, t)
  }
}

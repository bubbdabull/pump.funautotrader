import { Injectable } from '@nestjs/common'
import {
  activitySol,
  hasRealTimeTradeActivity,
  isDeadFeedToken,
  liveActivityScore,
  MIN_FEED_VOLUME_24H_SOL,
  normalizeVirtualSol,
  passesAlphaFilter,
  isPlaceholderTokenImage,
  normalizeFeedTokenLabels,
  pickTokenName,
  pickTokenSymbol,
  LIVE_FEED_MAX,
} from '@phronis/trading'
import type { FeedToken, FeedStats } from './feed.types'

@Injectable()
export class LiveFeedService {
  private readonly maxFeed: number
  private readonly tokens = new Map<string, FeedToken>()

  constructor() {
    this.maxFeed = LIVE_FEED_MAX
  }

  getMaxFeed(): number {
    return this.maxFeed
  }

  /** Alpha + volume bar; dead / zero-activity tokens are not stored. */
  shouldStore(token: FeedToken): boolean {
    if (!passesAlphaFilter(token)) return false
    if (hasRealTimeTradeActivity(token)) return true
    if ((token.trades1m ?? 0) > 0 || token.isActive) return true
    if (token.holdersVerified && (token.holders ?? 0) >= 5) return true
    if (isDeadFeedToken(token)) return false
    return activitySol(token) >= MIN_FEED_VOLUME_24H_SOL * 0.5
  }

  private mergeLabels(mint: string, ...sources: { symbol?: string; name?: string }[]) {
    const symbol = pickTokenSymbol(mint, ...sources.map((s) => s.symbol))
    const name = pickTokenName(mint, symbol, ...sources.map((s) => s.name))
    return normalizeFeedTokenLabels(mint, { symbol, name })
  }

  /** Merge activity/holders/images without re-running full store gates. */
  patch(token: FeedToken): FeedToken | null {
    const prev = this.tokens.get(token.mint)
    if (!prev) return this.upsert(token)
    const labels = this.mergeLabels(token.mint, prev, token)
    const merged: FeedToken = {
      ...prev,
      ...token,
      ...labels,
      image: this.pickImage(token.image, prev.image),
      metadataUri: token.metadataUri || prev.metadataUri,
      holders: token.holdersVerified
        ? (token.holders ?? prev.holders)
        : Math.max(prev.holders, token.holders ?? 0),
      holdersVerified: prev.holdersVerified || token.holdersVerified,
      volume24h: Math.max(prev.volume24h, token.volume24h),
      lastTradeAt: token.lastTradeAt ?? prev.lastTradeAt,
      trades1m: token.trades1m ?? prev.trades1m,
      volume5mSol: Math.max(prev.volume5mSol ?? 0, token.volume5mSol ?? 0),
      buyPressure1m: token.buyPressure1m ?? prev.buyPressure1m,
      mcapChange5m: token.mcapChange5m ?? prev.mcapChange5m,
      isActive: token.isActive ?? prev.isActive,
    }
    this.tokens.set(token.mint, merged)
    return merged
  }

  private pickImage(next?: string, prev?: string): string {
    if (next && !isPlaceholderTokenImage(next)) return next
    if (prev && !isPlaceholderTokenImage(prev)) return prev
    return ''
  }

  upsert(token: FeedToken): FeedToken | null {
    if (!this.shouldStore(token)) {
      return null
    }
    const prev = this.tokens.get(token.mint)
    const labels = prev ? this.mergeLabels(token.mint, prev, token) : this.mergeLabels(token.mint, token)
    const merged: FeedToken = prev
      ? {
          ...prev,
          ...token,
          ...labels,
          image: this.pickImage(token.image, prev.image),
          metadataUri: token.metadataUri || prev.metadataUri,
          holders: token.holdersVerified
            ? (token.holders ?? prev.holders)
            : Math.max(prev.holders, token.holders ?? 0),
          holdersVerified: prev.holdersVerified || token.holdersVerified,
          volume24h: Math.max(prev.volume24h, token.volume24h),
          launchedAt: prev.launchedAt || token.launchedAt,
          lastTradeAt: token.lastTradeAt ?? prev.lastTradeAt,
          trades1m: token.trades1m ?? prev.trades1m,
          volume5mSol: token.volume5mSol ?? prev.volume5mSol,
          buyPressure1m: token.buyPressure1m ?? prev.buyPressure1m,
          mcapChange5m: token.mcapChange5m ?? prev.mcapChange5m,
          isActive: token.isActive ?? prev.isActive,
        }
      : { ...token, ...labels }
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
              ...this.mergeLabels(t.mint, t, prev),
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
    const now = Date.now()
    return [...this.tokens.values()]
      .sort((a, b) => liveActivityScore(b, now) - liveActivityScore(a, now))
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
    const now = Date.now()
    for (const [mint, t] of this.tokens) {
      if (hasRealTimeTradeActivity(t, now)) continue
      if (isDeadFeedToken(t, now)) {
        this.tokens.delete(mint)
      }
    }
    if (this.tokens.size <= this.maxFeed) return
    const sorted = this.getAll(this.maxFeed)
    this.tokens.clear()
    for (const t of sorted) this.tokens.set(t.mint, t)
  }
}

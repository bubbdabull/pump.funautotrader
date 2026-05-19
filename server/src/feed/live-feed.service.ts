import { Injectable } from '@nestjs/common'
import { normalizeVirtualSol } from '@phronis/trading'
import type { FeedToken, FeedStats } from './feed.types'

const MAX_FEED = 120

@Injectable()
export class LiveFeedService {
  private readonly tokens = new Map<string, FeedToken>()

  upsert(token: FeedToken): FeedToken {
    const prev = this.tokens.get(token.mint)
    const merged: FeedToken = prev
      ? {
          ...prev,
          ...token,
          launchedAt: prev.launchedAt || token.launchedAt,
        }
      : token
    this.tokens.set(token.mint, merged)
    this.trim()
    return merged
  }

  mergeBootstrap(tokens: FeedToken[]) {
    for (const t of tokens) {
      const prev = this.tokens.get(t.mint)
      this.tokens.set(
        t.mint,
        prev
          ? {
              ...t,
              ...prev,
              holders: Math.max(prev.holders, t.holders),
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

  getAll(limit = MAX_FEED): FeedToken[] {
    return [...this.tokens.values()]
      .sort((a, b) => new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime())
      .slice(0, limit)
  }

  getStats(): FeedStats {
    const all = [...this.tokens.values()]
    const hourAgo = Date.now() - 60 * 60 * 1000
    const newTokensLastHour = all.filter((t) => new Date(t.launchedAt).getTime() > hourAgo).length
    const totalVolume24h = all.reduce((s, t) => {
      const vol = t.volume24h > 0 ? t.volume24h : normalizeVirtualSol(t.liquidity)
      return s + vol
    }, 0)
    const totalMarketCap = all.reduce((s, t) => s + t.marketCap, 0)
    const avgSignalScore =
      all.length > 0
        ? all.reduce((s, t) => s + t.signalScore, 0) / all.length
        : 0

    return {
      activeTokens: all.length,
      totalVolume24h,
      totalMarketCap,
      newTokensLastHour,
      avgSignalScore: Math.round(avgSignalScore),
    }
  }

  private trim() {
    if (this.tokens.size <= MAX_FEED) return
    const sorted = this.getAll(MAX_FEED)
    this.tokens.clear()
    for (const t of sorted) this.tokens.set(t.mint, t)
  }
}

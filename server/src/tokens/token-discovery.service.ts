import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  passesIngestGate,
  passesTradeableFilter,
  tradeQualityScore,
  rankTradeable,
} from '@phronis/trading'
import type { FeedToken } from '../feed/feed.types'

/** Wide pump.fun REST scan — candidates for autotrade + trade stream pins (separate from live WS feed). */
@Injectable()
export class TokenDiscoveryService {
  private readonly logger = new Logger(TokenDiscoveryService.name)
  private readonly maxPool: number
  private readonly pool = new Map<string, FeedToken>()
  private lastScanAt?: string
  private lastScanCount = 0

  constructor(config: ConfigService) {
    const n = Number(config.get('DISCOVERY_POOL_MAX') ?? 2500)
    this.maxPool = Number.isFinite(n) && n >= 200 ? Math.min(n, 5000) : 2500
  }

  getStats() {
    const all = [...this.pool.values()]
    return {
      poolSize: all.length,
      maxPool: this.maxPool,
      tradeableInPool: all.filter(passesTradeableFilter).length,
      lastScanAt: this.lastScanAt,
      lastScanCount: this.lastScanCount,
    }
  }

  get(mint: string): FeedToken | undefined {
    return this.pool.get(mint)
  }

  getAll(): FeedToken[] {
    return [...this.pool.values()]
  }

  /** Merge pump.fun REST rows (relaxed gate — keep breadth for autotrade filtering). */
  ingest(tokens: FeedToken[]) {
    let added = 0
    for (const t of tokens) {
      if (!passesIngestGate(t)) continue
      const prev = this.pool.get(t.mint)
      const merged: FeedToken = prev
        ? {
            ...prev,
            ...t,
            name: t.name || prev.name,
            symbol: t.symbol || prev.symbol,
            image: t.image || prev.image,
            metadataUri: t.metadataUri || prev.metadataUri,
            holders: Math.max(prev.holders ?? 0, t.holders ?? 0),
            holdersVerified: prev.holdersVerified || t.holdersVerified,
            volume24h: Math.max(prev.volume24h ?? 0, t.volume24h ?? 0),
            marketCap: Math.max(prev.marketCap ?? 0, t.marketCap ?? 0),
            twitter: t.twitter ?? prev.twitter,
            telegram: t.telegram ?? prev.telegram,
            website: t.website ?? prev.website,
          }
        : t
      if (!prev) added++
      this.pool.set(t.mint, merged)
    }
    this.trim()
    this.lastScanAt = new Date().toISOString()
    this.lastScanCount = tokens.length
    this.logger.log(
      `Discovery pool: ${this.pool.size} tokens (+${added} new, scanned ${tokens.length})`,
    )
  }

  getTopTradeable(limit = 120): FeedToken[] {
    return rankTradeable([...this.pool.values()], limit)
  }

  /** Best REST-sourced mints to subscribe for trade ticks (autotrade EV). */
  getTopForTradePins(limit = 100): string[] {
    const ranked = [...this.pool.values()]
      .sort((a, b) => tradeQualityScore(b) - tradeQualityScore(a))
      .slice(0, limit)
    return ranked.map((t) => t.mint)
  }

  private trim() {
    if (this.pool.size <= this.maxPool) return
    const ranked = [...this.pool.values()].sort(
      (a, b) => tradeQualityScore(b) - tradeQualityScore(a),
    )
    this.pool.clear()
    for (const t of ranked.slice(0, this.maxPool)) {
      this.pool.set(t.mint, t)
    }
  }
}

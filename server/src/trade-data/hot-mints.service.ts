import { Injectable } from '@nestjs/common'

/** Mints that received a trade tick recently — drives subscriptions + active feed. */
@Injectable()
export class HotMintsService {
  private readonly lastTrade = new Map<string, number>()
  private readonly maxEntries = 400

  recordTrade(mint: string, at = Date.now()) {
    this.lastTrade.set(mint, at)
    if (this.lastTrade.size > this.maxEntries) {
      const cutoff = at - 10 * 60_000
      for (const [m, t] of this.lastTrade) {
        if (t < cutoff) this.lastTrade.delete(m)
      }
    }
  }

  getHotMints(limit = 80, maxAgeMs = 300_000): string[] {
    const cutoff = Date.now() - maxAgeMs
    return [...this.lastTrade.entries()]
      .filter(([, t]) => t >= cutoff)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([m]) => m)
  }

  lastTradeAt(mint: string): number | undefined {
    return this.lastTrade.get(mint)
  }
}

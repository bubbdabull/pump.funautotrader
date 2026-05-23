import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { SupabasePersistenceService } from '../supabase/supabase-persistence.service'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { HotMintsService } from './hot-mints.service'
import { computeFeedActivity } from '@phronis/trading'

@Injectable()
export class TradeRehydrateService implements OnModuleInit {
  private readonly logger = new Logger(TradeRehydrateService.name)
  private done = false

  constructor(
    private supabasePersist: SupabasePersistenceService,
    private trading: TradingBridgeService,
    private liveFeed: LiveFeedService,
    private hotMints: HotMintsService,
  ) {}

  onModuleInit() {
    const t = setInterval(() => {
      if (this.supabasePersist.enabled) {
        clearInterval(t)
        void this.rehydrateFromDb().catch((err) =>
          this.logger.warn(`Trade rehydrate failed: ${(err as Error).message}`),
        )
      }
    }, 2_000)
    setTimeout(() => clearInterval(t), 60_000)
  }

  async rehydrateFromDb() {
    if (this.done || !this.supabasePersist.enabled) return
    this.done = true

    const feedMints = this.liveFeed.getAll(80).map((t) => t.mint)
    const hot = this.hotMints.getHotMints(60)
    const dbRows = await this.supabasePersist.safeListFeedTokensForRehydrate(60)
    const mints = [...new Set([...hot, ...feedMints, ...dbRows.map((r) => r.mint as string)])].slice(
      0,
      80,
    )
    if (!mints.length) {
      this.logger.log('Trade rehydrate: no mints to replay')
      return
    }

    let tradeCount = 0
    for (const mint of mints) {
      const activities = await this.supabasePersist.safeLoadRecentWalletActivity(mint, 120)
      const state = this.trading.getState(mint)
      const existingSigs = new Set(state?.trades.map((t) => t.signature) ?? [])

      for (const a of activities) {
        const sig = (a.signature as string) ?? undefined
        if (sig && existingSigs.has(sig)) continue
        this.trading.ingestTrade({
          mint,
          signature: sig,
          txType: (a.side as string) === 'sell' ? 'sell' : 'buy',
          solAmount: Number(a.solAmount ?? 0),
          tokenAmount: 0,
          traderPublicKey: a.wallet as string,
          timestamp: new Date(a.actedAt as string).getTime(),
        })
        tradeCount++
      }

      const updated = this.trading.getState(mint)
      if (updated) {
        const activity = computeFeedActivity(updated)
        const live = this.liveFeed.get(mint)
        if (live) {
          this.liveFeed.upsert({
            ...live,
            ...activity,
            marketCap: updated.marketCapUsd || live.marketCap,
            bondingCurvePercent: updated.bondingCurvePercent,
          })
        }
      }
    }

    this.logger.log(`Trade rehydrate: replayed ${tradeCount} ticks for ${mints.length} token(s)`)
  }
}

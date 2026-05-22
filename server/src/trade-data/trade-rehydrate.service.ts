import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { SupabaseDbService } from '../supabase/supabase-db.service'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { computeFeedActivity } from '@phronis/trading'

@Injectable()
export class TradeRehydrateService implements OnModuleInit {
  private readonly logger = new Logger(TradeRehydrateService.name)
  private done = false

  constructor(
    private supabase: SupabaseDbService,
    private trading: TradingBridgeService,
    private liveFeed: LiveFeedService,
  ) {}

  onModuleInit() {
    const t = setInterval(() => {
      if (this.supabase.enabled) {
        clearInterval(t)
        void this.rehydrateFromDb()
      }
    }, 2_000)
    setTimeout(() => clearInterval(t), 60_000)
  }

  async rehydrateFromDb() {
    if (this.done || !this.supabase.enabled) return
    this.done = true

    const rows = await this.supabase.listTradeableTokensForRehydrate(45)
    if (!rows.length) {
      this.logger.log('Trade rehydrate: no tradeable rows in DB yet')
      return
    }

    let tradeCount = 0
    for (const row of rows) {
      const mint = row.mint as string
      const activities = await this.supabase.loadRecentWalletActivity(mint, 120)
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

    this.logger.log(`Trade rehydrate: replayed ${tradeCount} ticks for ${rows.length} token(s)`)
  }
}

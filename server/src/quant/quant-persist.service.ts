import { Injectable, Logger } from '@nestjs/common'
import {
  globalMarketState,
  computeHDI,
  resolveHolderCount,
  type QuantitativeScores,
  type RugScoreBreakdown,
} from '@phronis/trading'
import { SupabaseDbService } from '../supabase/supabase-db.service'

@Injectable()
export class QuantPersistService {
  private readonly logger = new Logger(QuantPersistService.name)
  private readonly lastPersist = new Map<string, number>()
  private readonly throttleMs = 12_000

  constructor(private supabase: SupabaseDbService) {}

  shouldPersist(mint: string): boolean {
    const last = this.lastPersist.get(mint) ?? 0
    if (Date.now() - last < this.throttleMs) return false
    this.lastPersist.set(mint, Date.now())
    if (this.lastPersist.size > 2000) {
      const cutoff = Date.now() - this.throttleMs * 2
      for (const [m, t] of this.lastPersist) {
        if (t < cutoff) this.lastPersist.delete(m)
      }
    }
    return true
  }

  async persist(
    mint: string,
    scores: QuantitativeScores,
    rug: RugScoreBreakdown,
  ): Promise<void> {
    if (!this.supabase.enabled) return
    if (!this.shouldPersist(mint)) return

    const state = globalMarketState.getState(mint)
    if (!state) return

    const holders = resolveHolderCount(state)
    const balances = [...state.walletBalances.values()].filter((b) => b > 0)
    const total = balances.reduce((a, b) => a + b, 0)
    let top1Pct = 0
    let top5Pct = 0
    if (total > 0) {
      const sorted = [...balances].sort((a, b) => b - a)
      top1Pct = (sorted[0] ?? 0) / total
      top5Pct = sorted.slice(0, 5).reduce((a, b) => a + b, 0) / total
    }

    try {
      await this.supabase.persistQuantSnapshot(
        mint,
        scores,
        rug,
        holders,
        { top1Pct, top5Pct, entropy: computeHDI(state) },
        state.trades.slice(-15).map((t) => ({
          wallet: t.wallet,
          side: t.side,
          solAmount: t.solAmount,
          signature: t.signature,
          slot: t.slot,
          timestamp: t.timestamp,
        })),
      )
    } catch (err) {
      this.logger.warn(`Quant persist ${mint.slice(0, 8)}: ${(err as Error).message}`)
    }
  }
}

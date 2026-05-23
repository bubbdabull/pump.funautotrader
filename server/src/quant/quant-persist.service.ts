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

  /** Called only from PersistenceWorker — not on hot path. */
  async persistDirect(
    mint: string,
    scores: QuantitativeScores,
    rug: RugScoreBreakdown,
  ): Promise<void> {
    if (!this.supabase.enabled) return
    await this.writeSnapshot(mint, scores, rug)
  }

  async persist(
    mint: string,
    scores: QuantitativeScores,
    rug: RugScoreBreakdown,
  ): Promise<void> {
    if (!this.supabase.enabled) return
    if (!this.shouldPersist(mint)) return
    await this.writeSnapshot(mint, scores, rug)
  }

  private async writeSnapshot(
    mint: string,
    scores: QuantitativeScores,
    rug: RugScoreBreakdown,
  ): Promise<void> {

    const state = globalMarketState.getState(mint)
    if (!state) return

    const holders = resolveHolderCount({
      walletBalances: state.walletBalances,
      trades: state.trades,
      onChainHolders: state.onChainHolders,
    })
    const chain = state.onChainHolders
    let top1Pct = chain?.top1Pct ?? 0
    let top5Pct = chain?.top5Pct ?? 0
    const entropy = chain?.entropy ?? computeHDI(state)
    if (!chain) {
      const balances = [...state.walletBalances.values()].filter((b) => b > 0)
      const total = balances.reduce((a, b) => a + b, 0)
      if (total > 0) {
        const sorted = [...balances].sort((a, b) => b - a)
        top1Pct = (sorted[0] ?? 0) / total
        top5Pct = sorted.slice(0, 5).reduce((a, b) => a + b, 0) / total
      }
    }

    const tokenPatch = {
      mint,
      name: state.name ?? 'Unknown',
      symbol: state.symbol ?? mint.slice(0, 4),
      image: '',
      marketCap: state.marketCapUsd,
      bondingCurvePercent: state.bondingCurvePercent,
      holders,
      holdersVerified: Boolean(chain?.verified),
      volume24h: state.trades.reduce((a, t) => a + t.solAmount, 0),
      signalScore: 50,
      momentumScore: Math.round(scores.momentumScore),
      whaleActivity: 'low' as const,
      launchedAt: new Date(state.createdAt).toISOString(),
      priceUsd: 0,
      priceChange24h: 0,
      liquidity: state.liquidity,
    }

    try {
      await this.supabase.persistQuantSnapshot(
        mint,
        scores,
        rug,
        holders,
        {
          top1Pct,
          top5Pct,
          entropy,
          holdersVerified: chain?.verified,
          suspiciousClusterPct: chain?.suspiciousClusterPct,
        },
        state.trades.slice(-15).map((t) => ({
          wallet: t.wallet,
          side: t.side,
          solAmount: t.solAmount,
          signature: t.signature,
          slot: t.slot,
          timestamp: t.timestamp,
        })),
        tokenPatch,
      )
    } catch (err) {
      this.logger.warn(`Quant persist ${mint.slice(0, 8)}: ${(err as Error).message}`)
    }
  }
}

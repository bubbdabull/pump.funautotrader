import { Injectable, Logger } from '@nestjs/common'
import type { FeedToken } from '../feed/feed.types'
import type {
  FeedActivityFields,
  QuantitativeScores,
  RugScoreBreakdown,
  SignalAttributionRecord,
} from '@phronis/trading'
import { SupabaseDbService } from './supabase-db.service'
import type { PersistJob } from '../persistence/persistence.types'

const FAILURE_PAUSE_MS = 60_000
const FAILURE_THRESHOLD = 8

@Injectable()
export class SupabasePersistenceService {
  private readonly logger = new Logger(SupabasePersistenceService.name)
  private consecutiveFailures = 0
  private pausedUntil = 0
  private droppedWhilePaused = 0

  constructor(private db: SupabaseDbService) {}

  get enabled(): boolean {
    return this.db.enabled
  }

  isPaused(): boolean {
    return Date.now() < this.pausedUntil
  }

  getStats() {
    return {
      enabled: this.enabled,
      paused: this.isPaused(),
      consecutiveFailures: this.consecutiveFailures,
      droppedWhilePaused: this.droppedWhilePaused,
    }
  }

  private noteSuccess() {
    this.consecutiveFailures = 0
    this.pausedUntil = 0
  }

  private noteFailure(label: string, err: unknown) {
    this.consecutiveFailures++
    const msg = err instanceof Error ? err.message : String(err)
    this.logger.warn(`Supabase ${label}: ${msg}`)
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      this.pausedUntil = Date.now() + FAILURE_PAUSE_MS
      this.logger.warn(
        `Supabase persistence paused ${FAILURE_PAUSE_MS / 1000}s after ${this.consecutiveFailures} failures`,
      )
    }
  }

  private async run(label: string, fn: () => Promise<void>): Promise<void> {
    if (!this.enabled) return
    if (this.isPaused()) {
      this.droppedWhilePaused++
      return
    }
    try {
      await fn()
      this.noteSuccess()
    } catch (err) {
      this.noteFailure(label, err)
    }
  }

  async handleJob(job: PersistJob): Promise<void> {
    switch (job.type) {
      case 'wallet_activity':
        await this.run('wallet_activity', async () => {
          await this.db.insertWalletActivityOnce(job.mint, {
            wallet: job.wallet,
            side: job.side,
            solAmount: job.solAmount,
            signature: job.signature,
            slot: job.slot,
            timestamp: job.timestamp,
          })
        })
        break
      case 'token_live_activity':
        await this.run('token_live_activity', async () => {
          await this.db.patchTokenLiveActivity(job.mint, job.activity, job.meta)
        })
        break
      case 'feed_token':
        await this.run('feed_token', () => this.db.upsertFeedToken(job.token))
        break
      case 'signal_attribution':
        await this.run('signal_attribution', () => this.db.insertSignalAttribution(job.entry))
        break
      case 'quant_snapshot':
        await this.run('quant_snapshot', () =>
          this.writeQuantSnapshot(job.mint, job.scores, job.rug),
        )
        break
      default:
        break
    }
  }

  private async writeQuantSnapshot(
    mint: string,
    scores: QuantitativeScores,
    rug: RugScoreBreakdown,
  ): Promise<void> {
    const { globalMarketState, computeHDI, resolveHolderCount } = await import('@phronis/trading')
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

    await this.db.persistQuantSnapshot(
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
  }

  fireFeedToken(token: FeedToken): void {
    void this.run('feed_token', () => this.db.upsertFeedToken(token))
  }

  firePatchHolders(
    mint: string,
    snap: { holders: number; verified?: boolean; top1Pct?: number; top5Pct?: number; entropy?: number },
  ): void {
    void this.run('patch_holders', () =>
      this.db.patchTokenHolders(mint, snap.holders, Boolean(snap.verified), {
        top1Pct: snap.top1Pct,
        top5Pct: snap.top5Pct,
        entropy: snap.entropy,
      }),
    )
  }

  firePatchMedia(
    mint: string,
    patch: {
      image?: string
      metadataUri?: string | null
      twitter?: string | null
      telegram?: string | null
      website?: string | null
    },
  ): void {
    void this.run('patch_media', () => this.db.patchTokenMedia(mint, patch))
  }

  fireCreateAlert(data: {
    type: string
    title: string
    message: string
    mint?: string
  }): void {
    void this.run('create_alert', () => this.db.createAlert(data))
  }

  async safeFindTokenByMint(mint: string) {
    if (!this.enabled) return null
    try {
      return await this.db.findTokenByMint(mint)
    } catch (err) {
      this.noteFailure('find_token', err)
      return null
    }
  }

  async safeLoadRecentWalletActivity(mint: string, limit = 150) {
    if (!this.enabled) return []
    try {
      return await this.db.loadRecentWalletActivity(mint, limit)
    } catch (err) {
      this.noteFailure('load_activity', err)
      return []
    }
  }

  async safeListFeedTokensForRehydrate(limit = 80) {
    if (!this.enabled) return []
    try {
      return await this.db.listFeedTokensForRehydrate(limit)
    } catch (err) {
      this.noteFailure('list_feed', err)
      return []
    }
  }

  firePatchLiveActivity(
    mint: string,
    activity: FeedActivityFields,
    market?: { marketCap?: number; bondingCurvePercent?: number; volume24h?: number },
  ): void {
    void this.run('live_activity', () => this.db.patchTokenLiveActivity(mint, activity, market))
  }
}

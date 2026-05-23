import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  DYNAMICS_SNAPSHOT_VERSION,
  REDIS_SNAPSHOT_INTERVAL_MS,
  REDIS_SNAPSHOT_MAX_ACTIVE,
  REDIS_SNAPSHOT_MAX_DYNAMICS,
  REDIS_SNAPSHOT_MAX_FEED,
  REDIS_SNAPSHOT_MAX_WALLET_CLUSTERS,
  REDIS_RANKING_CACHE_TTL_SEC,
  restoreMintDynamics,
  serializeMintDynamics,
  type SerializedMintDynamics,
} from '@phronis/trading'
import { RedisService } from './redis.service'
import { REDIS_KEYS } from './redis-keys'
import { RedisLeaderboardService } from './redis-leaderboard.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { MarketDynamicsService } from '../intelligence/market-dynamics.service'
import {
  WalletGraphService,
  type WalletClusterLight,
} from '../intelligence/wallet-graph.service'
import { HotMintsService } from '../trade-data/hot-mints.service'
import { isApiProcess } from '../process-role'
import type { FeedToken } from '../feed/feed.types'

interface RegistrySnapshotPayload {
  version: number
  savedAt: number
  feed: FeedToken[]
}

interface DynamicsSnapshotPayload {
  version: number
  savedAt: number
  states: SerializedMintDynamics[]
}

interface ActiveTokensSnapshotPayload {
  version: number
  savedAt: number
  tokens: Array<{ mint: string; lastTradeAt: number; signalScore?: number; lifecycle?: string }>
}

interface WalletClustersSnapshotPayload {
  version: number
  savedAt: number
  clusters: WalletClusterLight[]
}

interface RankingCachePayload {
  savedAt: number
  rankings: Array<{ mint: string; score: number; lifecycle: string }>
}

@Injectable()
export class RedisSnapshotManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisSnapshotManagerService.name)
  private timer?: NodeJS.Timeout
  private recovered = false

  constructor(
    private redis: RedisService,
    private liveFeed: LiveFeedService,
    private dynamics: MarketDynamicsService,
    private walletGraph: WalletGraphService,
    private hotMints: HotMintsService,
    private leaderboard: RedisLeaderboardService,
  ) {}

  onModuleInit() {
    if (!isApiProcess()) return
    void this.recoverFromRedis()
    this.timer = setInterval(() => this.redis.fireAndForget(() => this.saveSnapshots()), REDIS_SNAPSHOT_INTERVAL_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async recoverFromRedis(): Promise<boolean> {
    if (!this.redis.enabled || this.recovered) return false
    try {
      const feedRaw =
        (await this.redis.get(REDIS_KEYS.snapshot.registry)) ??
        (await this.redis.get(REDIS_KEYS.legacy.registrySnapshot))
      const dynRaw =
        (await this.redis.get(REDIS_KEYS.snapshot.marketDynamics)) ??
        (await this.redis.get(REDIS_KEYS.legacy.dynamicsSnapshot))
      const activeRaw = await this.redis.get(REDIS_KEYS.snapshot.activeTokens)
      const walletRaw = await this.redis.get(REDIS_KEYS.snapshot.walletClusters)

      let feedCount = 0
      let dynCount = 0
      let activeCount = 0
      let walletCount = 0

      if (feedRaw) {
        const payload = JSON.parse(feedRaw) as RegistrySnapshotPayload
        if (payload.version === DYNAMICS_SNAPSHOT_VERSION && Array.isArray(payload.feed)) {
          for (const row of payload.feed) {
            if (!row?.mint) continue
            const prev = this.liveFeed.get(row.mint)
            if (prev?.lastTradeAt && (!row.lastTradeAt || row.lastTradeAt < prev.lastTradeAt)) {
              continue
            }
            this.liveFeed.upsert(row)
            feedCount++
          }
        }
      }

      if (dynRaw) {
        const payload = JSON.parse(dynRaw) as DynamicsSnapshotPayload
        if (payload.version === DYNAMICS_SNAPSHOT_VERSION && Array.isArray(payload.states)) {
          dynCount = this.dynamics.importStates(payload.states)
        }
      }

      if (activeRaw) {
        const payload = JSON.parse(activeRaw) as ActiveTokensSnapshotPayload
        if (Array.isArray(payload.tokens)) {
          for (const t of payload.tokens) {
            if (!t?.mint || !t.lastTradeAt) continue
            this.hotMints.recordTrade(t.mint, t.lastTradeAt)
            activeCount++
          }
        }
      }

      if (walletRaw) {
        const payload = JSON.parse(walletRaw) as WalletClustersSnapshotPayload
        if (Array.isArray(payload.clusters)) {
          walletCount = this.walletGraph.importLightClusters(payload.clusters)
        }
      }

      this.recovered = true
      if (dynCount > 0) {
        this.leaderboard.rebuildFromDynamics(100)
      }

      if (feedCount > 0 || dynCount > 0 || activeCount > 0 || walletCount > 0) {
        this.logger.log(
          `Redis recovery: feed=${feedCount} dynamics=${dynCount} active=${activeCount} wallets=${walletCount}`,
        )
      }
      return feedCount > 0 || dynCount > 0
    } catch (err) {
      this.logger.warn(`Redis recovery skipped: ${(err as Error).message}`)
      return false
    }
  }

  private async saveSnapshots() {
    if (!this.redis.enabled) return
    const now = Date.now()

    const feed = this.liveFeed
      .getAll(REDIS_SNAPSHOT_MAX_FEED * 2)
      .filter((t) => t.lastTradeAt && now - t.lastTradeAt < 600_000)
      .sort((a, b) => (b.lastTradeAt ?? 0) - (a.lastTradeAt ?? 0))
      .slice(0, REDIS_SNAPSHOT_MAX_FEED)

    const feedPayload: RegistrySnapshotPayload = {
      version: DYNAMICS_SNAPSHOT_VERSION,
      savedAt: now,
      feed,
    }
    await this.redis.set(REDIS_KEYS.snapshot.registry, JSON.stringify(feedPayload))
    await this.redis.set(REDIS_KEYS.legacy.registrySnapshot, JSON.stringify(feedPayload))

    const states = this.dynamics.exportStates(REDIS_SNAPSHOT_MAX_DYNAMICS)
    const dynPayload: DynamicsSnapshotPayload = {
      version: DYNAMICS_SNAPSHOT_VERSION,
      savedAt: now,
      states,
    }
    await this.redis.set(REDIS_KEYS.snapshot.marketDynamics, JSON.stringify(dynPayload))
    await this.redis.set(REDIS_KEYS.legacy.dynamicsSnapshot, JSON.stringify(dynPayload))

    const activePayload: ActiveTokensSnapshotPayload = {
      version: DYNAMICS_SNAPSHOT_VERSION,
      savedAt: now,
      tokens: feed.slice(0, REDIS_SNAPSHOT_MAX_ACTIVE).map((t) => ({
        mint: t.mint,
        lastTradeAt: t.lastTradeAt ?? now,
        signalScore: t.signalScore,
      })),
    }
    await this.redis.set(REDIS_KEYS.snapshot.activeTokens, JSON.stringify(activePayload))

    const clusters = this.walletGraph.exportLightClusters(REDIS_SNAPSHOT_MAX_WALLET_CLUSTERS)
    const walletPayload: WalletClustersSnapshotPayload = {
      version: DYNAMICS_SNAPSHOT_VERSION,
      savedAt: now,
      clusters,
    }
    await this.redis.set(REDIS_KEYS.snapshot.walletClusters, JSON.stringify(walletPayload))

    const rankings = this.dynamics.getRankings(80).map((a) => ({
      mint: a.mint,
      score: Math.round(a.tradeConfidenceScore * 100),
      lifecycle: a.lifecycle,
    }))
    const rankPayload: RankingCachePayload = { savedAt: now, rankings }
    await this.redis.set(
      REDIS_KEYS.legacy.rankingCache,
      JSON.stringify(rankPayload),
      REDIS_RANKING_CACHE_TTL_SEC,
    )
  }
}

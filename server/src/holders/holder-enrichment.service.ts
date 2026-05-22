import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { globalMarketState, resolveHolderCount, type OnChainHolderSnapshot } from '@phronis/trading'
import { HeliusService } from '../helius/helius.service'
import { BubblemapsService } from './bubblemaps.service'
import { LiveFeedService } from '../feed/live-feed.service'
import { TokensService } from '../tokens/tokens.service'
import { EventsGateway } from '../events/events.gateway'
import { PumpService } from '../pump/pump.service'

function mergeSnapshots(
  helius: OnChainHolderSnapshot | null,
  bubble: OnChainHolderSnapshot | null,
): OnChainHolderSnapshot | null {
  if (!helius && !bubble) return null
  if (!helius) return bubble
  if (!bubble) return helius

  return {
    holders: Math.max(helius.holders, bubble.holders),
    top1Pct: Math.max(helius.top1Pct, bubble.top1Pct),
    top5Pct: Math.max(helius.top5Pct, bubble.top5Pct),
    entropy: Math.max(helius.entropy, bubble.entropy),
    suspiciousClusterPct: bubble.suspiciousClusterPct ?? helius.suspiciousClusterPct,
    source: 'merged',
    verified: true,
    updatedAt: Date.now(),
  }
}

@Injectable()
export class HolderEnrichmentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HolderEnrichmentService.name)
  private readonly cache = new Map<string, OnChainHolderSnapshot>()
  private readonly inflight = new Set<string>()
  private timer?: NodeJS.Timeout

  constructor(
    private config: ConfigService,
    private helius: HeliusService,
    private bubblemaps: BubblemapsService,
    private liveFeed: LiveFeedService,
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    private events: EventsGateway,
    private pump: PumpService,
  ) {}

  onModuleInit() {
    const ms = Number(this.config.get('HOLDER_ENRICH_INTERVAL_MS') ?? 90_000)
    if (!Number.isFinite(ms) || ms < 20_000) return
    this.timer = setInterval(() => void this.enrichActiveFeed(), ms)
    setTimeout(() => void this.enrichActiveFeed(), 8_000)
    this.logger.log(
      `Holder enrichment every ${Math.round(ms / 1000)}s (Helius: ${this.helius.enabled}, Bubblemaps: ${this.bubblemaps.enabled})`,
    )
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  getCached(mint: string): OnChainHolderSnapshot | undefined {
    return this.cache.get(mint)
  }

  getHolderCount(mint: string): number | undefined {
    const snap = this.cache.get(mint)
    if (snap) return snap.holders
    const state = globalMarketState.getState(mint)
    if (state) return resolveHolderCount(state)
    return undefined
  }

  async enrichMint(mint: string, force = false): Promise<OnChainHolderSnapshot | null> {
    if (this.inflight.has(mint)) return this.cache.get(mint) ?? null
    const cached = this.cache.get(mint)
    if (!force && cached && Date.now() - cached.updatedAt < 75_000) return cached

    this.inflight.add(mint)
    try {
      const exclude = await this.resolveExcludeWallets(mint)
      const [heliusSnap, bubbleSnap] = await Promise.all([
        this.helius.enabled
          ? this.helius.fetchMintHolderSnapshot(mint, exclude)
          : Promise.resolve(null),
        this.bubblemaps.enabled
          ? this.bubblemaps.fetchHolderSnapshot(mint)
          : Promise.resolve(null),
      ])

      const merged = mergeSnapshots(heliusSnap, bubbleSnap)
      if (!merged) return null

      this.cache.set(mint, merged)
      globalMarketState.patchOnChainHolders(mint, merged)
      if (exclude.length) globalMarketState.addExcludeWallets(mint, exclude)

      const promoted = this.tokens.promoteIfTradeable(mint, merged.holders)
      if (promoted) {
        this.events.server?.to('feed').emit('feed:patch', promoted)
        this.events.server?.emit('quant:update', {
          mint,
          holders: promoted.holders,
          holdersVerified: true,
          at: new Date().toISOString(),
        })
      } else {
        this.events.server?.emit('quant:update', {
          mint,
          holders: merged.holders,
          holdersVerified: true,
          at: new Date().toISOString(),
        })
      }

      return merged
    } finally {
      this.inflight.delete(mint)
    }
  }

  private async resolveExcludeWallets(mint: string): Promise<string[]> {
    const out: string[] = []
    const coin = await this.pump.getCoin(mint)
    if (coin?.bonding_curve) out.push(coin.bonding_curve as string)
    if (coin?.associated_bonding_curve) out.push(coin.associated_bonding_curve as string)
    if (coin?.creator) out.push(coin.creator as string)
    const state = globalMarketState.getState(mint)
    if (state?.deployerWallet) out.push(state.deployerWallet)
    return [...new Set(out.filter((w) => w.length > 30))]
  }

  private async enrichActiveFeed() {
    const feed = this.liveFeed.getAll(500)
    const ranked = [...feed]
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      .slice(0, Number(this.config.get('HOLDER_ENRICH_BATCH') ?? 50))

    let ok = 0
    for (const t of ranked) {
      try {
        const snap = await this.enrichMint(t.mint)
        if (snap) ok++
      } catch (err) {
        this.logger.debug(`Holder enrich ${t.mint.slice(0, 8)}: ${(err as Error).message}`)
      }
      await new Promise((r) => setTimeout(r, 120))
    }
    if (ok > 0) {
      this.logger.log(`Holder snapshots updated for ${ok}/${ranked.length} mints`)
    }
  }
}

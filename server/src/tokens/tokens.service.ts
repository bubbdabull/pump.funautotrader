import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { PumpService, type PumpCoin } from '../pump/pump.service'
import { PumpPortalService } from '../pumpportal/pumpportal.service'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { LiveFeedService } from '../feed/live-feed.service'
import type { FeedToken, FeedTrade } from '../feed/feed.types'
import {
  evScoreToSignalScore,
  momentumScoreFromMetrics,
  evaluateEntry,
  resolveHolderCount,
  filterForLane,
  passesTradeableFilter,
  bondingCurvePercentFromSol,
  buildOhlcvFromTrades,
  buildChartPointsFromCandles,
  candleChangePct,
  mcapToPriceUsd,
  curveFromLiquiditySnapshot,
  computeFeedActivity,
  type ScannerLane,
} from '@phronis/trading'
import {
  marketCapUsdFromSol,
  normalizeVirtualSol,
  resolveTokenImage,
  resolveDisplayImage,
  isDirectImageUrl,
  isPlaceholderTokenImage,
} from '@phronis/trading'
import type { TokenChartSeries, ChartPoint, OhlcvCandle } from './chart.types'
import { TokenMetadataService } from './token-metadata.service'
import { SupabaseDbService } from '../supabase/supabase-db.service'
import { HolderEnrichmentService } from '../holders/holder-enrichment.service'
import { EventsGateway } from '../events/events.gateway'

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name)

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private pump: PumpService,
    private pumpportal: PumpPortalService,
    private trading: TradingBridgeService,
    private liveFeed: LiveFeedService,
    private metadata: TokenMetadataService,
    private supabase: SupabaseDbService,
    @Inject(forwardRef(() => HolderEnrichmentService))
    private holderEnrichment: HolderEnrichmentService,
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
  ) {}

  private pumpBootstrapLimit(): number {
    const n = Number(this.config.get('PUMP_FUN_BOOTSTRAP_LIMIT') ?? 100)
    return Number.isFinite(n) && n >= 10 ? Math.min(n, 200) : 100
  }

  async getFeed(lane: ScannerLane = 'tradeable'): Promise<FeedToken[]> {
    const all = await this.getAllTokens()
    const filtered = filterForLane(all, lane)
    await this.hydrateActivityFromDb(filtered)
    return filtered.map((t) => this.liveFeed.get(t.mint) ?? t)
  }

  /** Fill activity from DB when in-memory state is cold (e.g. after restart). */
  private async hydrateActivityFromDb(tokens: FeedToken[]) {
    if (!this.supabase.enabled) return
    const cold = tokens.filter((t) => !t.lastTradeAt && !t.isActive).slice(0, 30)
    for (const t of cold) {
      const row = await this.supabase.findTokenByMint(t.mint)
      if (!row?.lastTradeAt) continue
      const lastMs = new Date(row.lastTradeAt as string).getTime()
      const patch: Partial<FeedToken> = {
        lastTradeAt: lastMs,
        trades1m: Number(row.trades1m ?? 0),
        volume5mSol: Number(row.volume5mSol ?? 0),
        buyPressure1m: Number(row.buyPressure1m ?? 50),
        mcapChange5m: Number(row.mcapChange5m ?? 0),
        isActive: Boolean(row.isActive) || Date.now() - lastMs < 120_000,
      }
      this.liveFeed.upsert({ ...t, ...patch })
    }
  }

  async getGraduatingFeed(): Promise<FeedToken[]> {
    return this.getFeed('graduating')
  }

  private async getAllTokens(): Promise<FeedToken[]> {
    const cached = this.liveFeed.getAll()
    if (cached.length > 0) {
      this.kickHolderEnrich(cached)
      this.kickImageEnrich(cached)
      void this.bootstrapFeedFromPump().catch((err) =>
        this.logger.debug(`Pump.fun bootstrap skipped: ${(err as Error).message}`),
      )
      return cached.map((t) => this.attachActivity(this.enrichFromMarketState(t.mint, t), t.mint))
    }
    const boot = await this.bootstrapFeedFromPump()
    return boot.map((t) => this.attachActivity(this.enrichFromMarketState(t.mint, t), t.mint))
  }

  private async bootstrapFeedFromPump(): Promise<FeedToken[]> {
    const limit = this.pumpBootstrapLimit()
    const [active, nearGrad] = await Promise.all([
      this.pump.fetchActiveTradingCoins(limit),
      this.pump.fetchNearGraduation(Math.min(40, limit)),
    ])
    const byMint = new Map<string, PumpCoin>()
    for (const c of [...active, ...nearGrad]) byMint.set(c.mint, c)
    const mapped = await Promise.all([...byMint.values()].map((c) => this.mapCoin(c)))
    this.liveFeed.mergeBootstrap(mapped)
    return this.liveFeed.getAll()
  }

  getChartSeries(mint: string, intervalMs = 5_000): TokenChartSeries {
    const state = this.trading.getState(mint)
    const token = this.liveFeed.get(mint)
    const fallbackMcap = token?.marketCap ?? state?.marketCapUsd ?? 0
    const fallbackCurve = token?.bondingCurvePercent ?? state?.bondingCurvePercent ?? 0
    const bucketMs = Math.max(1_000, Math.min(60_000, intervalMs))
    const liqHist = state?.liquidityHistory ?? []

    const candles: OhlcvCandle[] = state?.trades.length
      ? buildOhlcvFromTrades(state.trades, bucketMs, fallbackMcap, 300, liqHist)
      : []

    let outCandles = candles
    if (!outCandles.length && liqHist.length) {
      outCandles = buildOhlcvFromTrades(
        [],
        bucketMs,
        fallbackMcap,
        300,
        liqHist,
      )
    }

    const points: ChartPoint[] = buildChartPointsFromCandles(outCandles, fallbackCurve).map(
      (p) => ({
        t: p.t,
        price: p.price,
        priceUsd: p.priceUsd,
        volume: p.volume,
        curve: p.curve,
      }),
    )

    if (!points.length && token) {
      const mc = token.marketCap || fallbackMcap
      points.push({
        t: Date.now(),
        price: mc,
        priceUsd: mcapToPriceUsd(mc),
        volume: token.volume24h,
        curve: token.bondingCurvePercent,
      })
    }

    const lastTrade = state?.trades[state.trades.length - 1]
    const lastCandle = outCandles[outCandles.length - 1]
    const currentMcap =
      lastCandle?.close ?? state?.marketCapUsd ?? fallbackMcap
    const lastHist = liqHist[liqHist.length - 1]
    const currentCurve =
      lastCandle?.curve ??
      (lastHist ? curveFromLiquiditySnapshot(lastHist) : fallbackCurve)

    return {
      mint,
      intervalMs: bucketMs,
      candles: outCandles,
      points: points.slice(-300),
      tradeCount: state?.trades.length ?? 0,
      lastTradeAt: lastTrade?.timestamp,
      currentMcap,
      currentPriceUsd: mcapToPriceUsd(currentMcap),
      currentCurve,
      changePct: candleChangePct(outCandles),
    }
  }


  async getToken(mint: string): Promise<FeedToken | null> {
    const live = this.liveFeed.get(mint)
    if (live) return this.enrichFromMarketState(mint, live)

    if (this.prisma.enabled) {
      const db = await this.prisma.token.findUnique({ where: { mint } })
      if (db) return this.formatDb(db)
    } else if (this.supabase.enabled) {
      const db = await this.supabase.findTokenByMint(mint)
      if (db) return this.formatDb(db as Parameters<typeof this.formatDb>[0])
    }

    const coin = await this.pump.getCoin(mint)
    if (!coin) {
      const state = this.trading.getState(mint)
      if (state) return this.tokenFromMarketState(mint)
      return null
    }
    return this.mapCoin(coin)
  }

  async getTrades(mint: string, limit = 50): Promise<FeedTrade[]> {
    const state = this.trading.getState(mint)
    if (state?.trades.length) {
      return state.trades
        .slice(-limit)
        .reverse()
        .map((t) => ({
          signature: t.signature,
          wallet: t.wallet,
          side: t.side,
          solAmount: t.solAmount,
          tokenAmount: t.tokenAmount,
          timestamp: new Date(t.timestamp).toISOString(),
        }))
    }

    if (this.supabase.enabled) {
      const rows = await this.supabase.loadRecentWalletActivity(mint, limit)
      return rows
        .reverse()
        .map((a) => ({
          signature: (a.signature as string) ?? undefined,
          wallet: a.wallet as string,
          side: (a.side as string) === 'sell' ? 'sell' : 'buy',
          solAmount: Number(a.solAmount ?? 0),
          tokenAmount: 0,
          timestamp: new Date(a.actedAt as string).toISOString(),
        }))
    }
    return []
  }

  /** Write feed token + activity to Supabase (all lanes, not only strict tradeable). */
  persistFeedToken(token: FeedToken): void {
    if (!this.supabase.enabled) return
    void this.supabase.upsertFeedToken(token).catch((err) =>
      this.logger.debug(`persistFeedToken ${token.mint.slice(0, 8)}: ${(err as Error).message}`),
    )
  }

  /** Push verified holder count into live feed + clients. */
  applyHolderSnapshot(mint: string, snap: { holders: number; verified?: boolean }): FeedToken | null {
    const live = this.liveFeed.get(mint)
    if (!live) return null
    const state = this.trading.getState(mint)
    const streamHolders = state
      ? resolveHolderCount({
          walletBalances: state.walletBalances,
          trades: state.trades,
          onChainHolders: snap.verified ? snap : undefined,
        })
      : snap.holders
    const holders = Math.max(snap.holders, streamHolders, live.holders ?? 0)
    const holdersVerified = Boolean(snap.verified)
    const enriched = this.enrichFromMarketState(mint, {
      ...live,
      holders,
      holdersVerified,
    })
    const saved = this.liveFeed.patch(enriched) ?? this.liveFeed.upsert(enriched)
    if (!saved) return null
    this.events.server?.to('feed').emit('feed:patch', saved)
    this.events.server?.emit('token:update', saved)
    this.persistFeedToken(saved)
    return saved
  }

  patchHoldersToDb(mint: string, snap: { holders: number; verified?: boolean; top1Pct?: number; top5Pct?: number; entropy?: number }): void {
    if (!this.supabase.enabled) return
    void this.supabase
      .patchTokenHolders(mint, snap.holders, Boolean(snap.verified), {
        top1Pct: snap.top1Pct,
        top5Pct: snap.top5Pct,
        entropy: snap.entropy,
      })
      .catch((err) =>
        this.logger.debug(`patchHolders ${mint.slice(0, 8)}: ${(err as Error).message}`),
      )
  }

  getStats() {
    return this.liveFeed.getStats()
  }

  upsertLiveToken(
    token: FeedToken,
    options?: { isNew?: boolean; whaleSol?: number },
  ): FeedToken | null {
    const enriched = this.enrichFromMarketState(token.mint, token)
    const saved = this.liveFeed.upsert(enriched) ?? this.liveFeed.patch(enriched)
    if (!saved) return null
    void this.persistToSupabase(saved, options)
    return saved
  }

  /** After holder on-chain snapshot or trades — add to feed if now tradeable. */
  promoteIfTradeable(mint: string, holderCount?: number): FeedToken | null {
    const live = this.liveFeed.get(mint)
    const state = this.trading.getState(mint)
    const chain = this.holderEnrichment.getCached(mint)
    const base =
      live ??
      (state ? this.tokenFromMarketState(mint) : null) ??
      null
    if (!base) return null

    const holders =
      holderCount ??
      (state
        ? resolveHolderCount({
            walletBalances: state.walletBalances,
            trades: state.trades,
            onChainHolders: chain ?? state.onChainHolders,
          })
        : Math.max(base.holders, chain?.holders ?? 0))

    const enriched = this.enrichFromMarketState(mint, {
      ...base,
      holders,
      holdersVerified: Boolean(chain?.verified),
    })
    const saved = this.liveFeed.upsert(enriched) ?? this.liveFeed.patch(enriched)
    if (saved) this.persistFeedToken(saved)
    return saved
  }

  /** Push live trade activity to feed + clients even when full upsert gates fail. */
  emitFeedPatch(mint: string, whaleSol?: number): FeedToken | null {
    const state = this.trading.getState(mint)
    let live = this.liveFeed.get(mint)
    if (!live && state?.trades.length) {
      const built = this.tokenFromMarketState(mint)
      if (built) {
        live = this.liveFeed.upsert(built) ?? this.liveFeed.patch(built) ?? undefined
      }
    }
    if (!state && !live) return null
    const activity = state ? computeFeedActivity(state) : {}
    const base =
      live ??
      (state ? this.tokenFromMarketState(mint) : null)
    if (!base) return null
    const enriched = this.enrichFromMarketState(mint, {
      ...base,
      ...activity,
      marketCap: state?.marketCapUsd || base.marketCap,
      bondingCurvePercent: state?.bondingCurvePercent ?? base.bondingCurvePercent,
      volume24h: state
        ? Math.max(base.volume24h, state.trades.reduce((a, t) => a + t.solAmount, 0))
        : base.volume24h,
    })
    const saved = this.liveFeed.patch(enriched) ?? this.liveFeed.upsert(enriched)
    if (!saved) return null
    this.events.server?.emit('token:update', saved)
    this.events.server?.to('feed').emit('feed:patch', saved)
    this.events.emitChartUpdate(mint)
    this.persistFeedToken(saved)
    if (!saved.holdersVerified) void this.holderEnrichment.enrichMint(mint)
    if (whaleSol && whaleSol >= 5) {
      void this.persistToSupabase(saved, { whaleSol })
    }
    return saved
  }

  private async persistToSupabase(
    token: FeedToken,
    options?: { isNew?: boolean; whaleSol?: number },
  ) {
    try {
      if (this.supabase.enabled && !this.prisma.enabled) {
        await this.supabase.upsertFeedToken(token)
        if (options?.isNew) {
          await this.supabase.createAlert({
            type: 'token',
            title: `New launch: ${token.symbol}`,
            message: `${token.name} · curve ${token.bondingCurvePercent}% · signal ${token.signalScore}`,
            mint: token.mint,
          })
        }
        if (options?.whaleSol && options.whaleSol >= 5) {
          await this.supabase.createAlert({
            type: 'whale',
            title: `Whale ${token.symbol}`,
            message: `${options.whaleSol.toFixed(2)} SOL trade on ${token.name}`,
            mint: token.mint,
          })
        }
        return
      }

      if (!this.prisma.enabled) return

      await this.prisma.token.upsert({
        where: { mint: token.mint },
        create: {
          mint: token.mint,
          name: token.name,
          symbol: token.symbol,
          image: token.image,
          marketCap: token.marketCap,
          bondingCurvePercent: token.bondingCurvePercent,
          holders: token.holders,
          volume24h: token.volume24h,
          aiRiskScore: token.signalScore,
          momentumScore: token.momentumScore,
          whaleActivity: token.whaleActivity,
          priceUsd: token.priceUsd,
          priceChange24h: token.priceChange24h,
          liquidity: token.liquidity,
          launchedAt: new Date(token.launchedAt),
        },
        update: {
          marketCap: token.marketCap,
          bondingCurvePercent: token.bondingCurvePercent,
          holders: token.holders,
          volume24h: token.volume24h,
          aiRiskScore: token.signalScore,
          momentumScore: token.momentumScore,
          whaleActivity: token.whaleActivity,
          priceChange24h: token.priceChange24h,
          liquidity: token.liquidity,
          updatedAt: new Date(),
        },
      })

      if (options?.isNew) {
        await this.prisma.alert.create({
          data: {
            type: 'token',
            title: `New launch: ${token.symbol}`,
            message: `${token.name} · curve ${token.bondingCurvePercent}% · signal ${token.signalScore}`,
            mint: token.mint,
          },
        })
      }

      if (options?.whaleSol && options.whaleSol >= 5) {
        await this.prisma.alert.create({
          data: {
            type: 'whale',
            title: `Whale ${token.symbol}`,
            message: `${options.whaleSol.toFixed(2)} SOL trade on ${token.name}`,
            mint: token.mint,
          },
        })
      }
    } catch (err) {
      this.logger.warn(`Supabase persist failed: ${(err as Error).message}`)
    }
  }

  async syncFromPump() {
    const limit = this.pumpBootstrapLimit()
    const [latest, nearGrad] = await Promise.all([
      this.pump.fetchActiveTradingCoins(limit),
      this.pump.fetchNearGraduation(30),
    ])
    const byMint = new Map<string, PumpCoin>()
    for (const c of [...latest, ...nearGrad]) byMint.set(c.mint, c)

    for (const coin of byMint.values()) {
      const mapped = await this.mapCoin(coin)
      this.liveFeed.upsert(mapped)
      void this.enrichTokenMedia(mapped.mint, {
        metadataUri: coin.metadata_uri,
        image: coin.image_uri,
        twitter: coin.twitter,
        telegram: coin.telegram,
        website: coin.website,
      })
      if (this.supabase.enabled && !this.prisma.enabled && passesTradeableFilter(mapped)) {
        await this.supabase.upsertToken(mapped)
        continue
      }
      if (!this.prisma.enabled) continue
      await this.prisma.token.upsert({
        where: { mint: coin.mint },
        create: {
          mint: coin.mint,
          name: mapped.name,
          symbol: mapped.symbol,
          image: mapped.image,
          marketCap: mapped.marketCap,
          bondingCurvePercent: mapped.bondingCurvePercent,
          holders: mapped.holders,
          volume24h: mapped.volume24h,
          aiRiskScore: mapped.signalScore,
          momentumScore: mapped.momentumScore,
          whaleActivity: mapped.whaleActivity,
          priceUsd: mapped.priceUsd,
          priceChange24h: mapped.priceChange24h,
          liquidity: mapped.liquidity,
          launchedAt: new Date(mapped.launchedAt),
        },
        update: {
          marketCap: mapped.marketCap,
          bondingCurvePercent: mapped.bondingCurvePercent,
          volume24h: mapped.volume24h,
          aiRiskScore: mapped.signalScore,
          momentumScore: mapped.momentumScore,
          priceChange24h: mapped.priceChange24h,
        },
      })
    }
    return byMint.size
  }

  private async enrichTokenMedia(
    mint: string,
    fields: {
      metadataUri?: string
      image?: string
      twitter?: string
      telegram?: string
      website?: string
    },
  ) {
    try {
      const media = await this.metadata.enrichToken(mint, {
        metadataUri: fields.metadataUri,
        image: fields.image,
        twitter: fields.twitter,
        telegram: fields.telegram,
        website: fields.website,
      })
      const current = this.liveFeed.get(mint)
      if (!current) return
      const saved = this.upsertLiveToken({
        ...current,
        image: media.image,
        metadataUri: media.metadataUri ?? current.metadataUri,
        twitter: media.twitter ?? current.twitter,
        telegram: media.telegram ?? current.telegram,
        website: media.website ?? current.website,
      })
      if (saved) {
        this.persistFeedToken(saved)
        void this.supabase.patchTokenMedia(mint, {
          image: media.image,
          metadataUri: media.metadataUri ?? saved.metadataUri,
          twitter: media.twitter,
          telegram: media.telegram,
          website: media.website,
        })
        this.events.server?.to('feed').emit('feed:patch', saved)
        this.events.server?.emit('token:update', saved)
      }
    } catch (err) {
      this.logger.debug(`Media enrich ${mint}: ${(err as Error).message}`)
    }
  }

  private async mapCoin(coin: PumpCoin): Promise<FeedToken> {
    const live = this.trading.getState(coin.mint)
    if (live) {
      const base = this.tokenFromMarketState(coin.mint, coin)
      if (base) return base
    }

    const bondingCurvePercent = this.pump.calculateBondingPercent(coin)
    const marketCap = coin.usd_market_cap ?? coin.market_cap ?? 0
    const volume24h = coin.usd_24h_volume ?? 0
    const state = this.trading.getState(coin.mint)
    const holders = state
      ? resolveHolderCount(state, coin.holder_count)
      : Math.max(coin.holder_count ?? 0, 1)
    const liquidity = this.pump.solReservesToLiquidity(coin.virtual_sol_reserves ?? 0)
    const image =
      this.metadata.getCached(coin.mint) ||
      resolveDisplayImage(coin.mint, { image: coin.image_uri, uri: coin.metadata_uri })

    const scores = this.pumpportal.ruleBasedSignal({
      mint: coin.mint,
      bondingCurvePercent,
      marketCap,
      volume24h,
      holders,
    })

    const momentum = scores.momentumScore
    return {
      mint: coin.mint,
      name: coin.name,
      symbol: coin.symbol,
      image,
      metadataUri: coin.metadata_uri,
      twitter: coin.twitter,
      telegram: coin.telegram,
      website: coin.website,
      marketCap,
      bondingCurvePercent,
      holders,
      volume24h,
      signalScore: scores.signalScore,
      momentumScore: momentum,
      whaleActivity: (momentum > 70 ? 'high' : momentum > 40 ? 'medium' : 'low') as
        | 'low'
        | 'medium'
        | 'high',
      launchedAt: new Date(coin.created_timestamp ?? Date.now()).toISOString(),
      priceUsd: marketCap > 0 ? marketCap / 1_000_000_000 : 0,
      priceChange24h: coin.price_change_24h ?? 0,
      liquidity: liquidity || marketCap * 0.01,
    }
  }

  private tokenFromMarketState(mint: string, coin?: PumpCoin): FeedToken | null {
    const state = this.trading.getState(mint)
    if (!state) return null

    const metrics = evaluateEntry(state).metrics
    const volume24h = state.trades.reduce((a, t) => a + t.solAmount, 0)
    const chain = this.holderEnrichment.getCached(mint)
    const { holders, holdersVerified } = this.resolveStableHolders(mint, {
      mint,
      holders: resolveHolderCount(
        {
          walletBalances: state.walletBalances,
          trades: state.trades,
          onChainHolders: chain?.verified ? chain : state.onChainHolders,
        },
        coin?.holder_count,
      ),
      holdersVerified: Boolean(chain?.verified),
    } as FeedToken, chain)

    const mcaps = state.liquidityHistory.map((h) => h.marketCapSol).filter((m) => m > 0)
    let priceChange24h = coin?.price_change_24h ?? 0
    if (mcaps.length >= 2) {
      const first = mcaps[0]
      const last = mcaps[mcaps.length - 1]
      if (first > 0) priceChange24h = ((last - first) / first) * 100
    }

    const momentum = momentumScoreFromMetrics(metrics)
    const base: FeedToken = {
      mint,
      name: state.name ?? coin?.name ?? 'Unknown',
      symbol: state.symbol ?? coin?.symbol ?? mint.slice(0, 4).toUpperCase(),
      image:
        this.metadata.getCached(mint) ||
        resolveDisplayImage(mint, { image: coin?.image_uri, uri: coin?.metadata_uri }),
      metadataUri: coin?.metadata_uri,
      twitter: coin?.twitter ?? this.metadata.getEnrichment(mint)?.twitter,
      telegram: coin?.telegram,
      website: coin?.website ?? this.metadata.getEnrichment(mint)?.website,
      marketCap: state.marketCapUsd || (coin?.usd_market_cap ?? coin?.market_cap ?? 0),
      bondingCurvePercent: state.bondingCurvePercent,
      holders,
      holdersVerified,
      volume24h,
      signalScore: evScoreToSignalScore(metrics),
      momentumScore: momentum,
      whaleActivity: (momentum > 70 ? 'high' : momentum > 40 ? 'medium' : 'low') as
        | 'low'
        | 'medium'
        | 'high',
      launchedAt: new Date(state.createdAt).toISOString(),
      priceUsd: state.marketCapUsd > 0 ? state.marketCapUsd / 1_000_000_000 : 0,
      priceChange24h,
      liquidity: normalizeVirtualSol(state.liquidity),
    }
    return this.attachActivity(base, mint)
  }

  /** Resolve IPFS/metadata images for rows still on placeholder URLs. */
  private pickFeedImage(mint: string, ...urls: (string | undefined)[]): string {
    const cached = this.metadata.getCached(mint)
    if (cached && !isPlaceholderTokenImage(cached)) return cached
    for (const u of urls) {
      if (u && !isPlaceholderTokenImage(u) && isDirectImageUrl(u)) return u
    }
    return ''
  }

  private kickImageEnrich(tokens: FeedToken[]) {
    const batch = tokens
      .filter((t) => {
        const cached = this.metadata.getCached(t.mint)
        if (cached && !isPlaceholderTokenImage(cached)) return false
        if (t.image && !isPlaceholderTokenImage(t.image)) return false
        return Boolean(t.metadataUri || t.image)
      })
      .slice(0, 18)
    for (const t of batch) {
      void this.enrichTokenMedia(t.mint, {
        metadataUri: t.metadataUri,
        image: t.image,
      })
    }
  }

  /** Holders never drop after verification; stream estimates only increase until Helius confirms. */
  private resolveStableHolders(
    mint: string,
    token: FeedToken,
    chain: ReturnType<HolderEnrichmentService['getCached']>,
  ): { holders: number; holdersVerified: boolean } {
    if (chain?.verified && chain.holders >= 2) {
      return { holders: Math.max(chain.holders, computed, prev), holdersVerified: true }
    }

    const state = this.trading.getState(mint)
    const prev = token.holders ?? 0
    const verified = Boolean(token.holdersVerified || chain?.verified)
    const onChainForCount =
      chain && chain.holders > 0 ? chain : state?.onChainHolders

    const computed = state
      ? resolveHolderCount({
          walletBalances: state.walletBalances,
          trades: state.trades,
          onChainHolders: onChainForCount,
        })
      : Math.max(prev, chain?.holders ?? 0)

    if (verified) {
      return { holders: Math.max(prev, computed), holdersVerified: true }
    }
    return {
      holders: Math.max(prev, computed),
      holdersVerified: false,
    }
  }

  private attachActivity(token: FeedToken, mint: string): FeedToken {
    const state = this.trading.getState(mint)
    if (!state) return token
    return { ...token, ...computeFeedActivity(state) }
  }

  /** Background Helius refresh for feed rows still showing stream holder estimates. */
  private kickHolderEnrich(tokens: FeedToken[]) {
    if (!this.holderEnrichment) return
    const batch = tokens
      .filter((t) => {
        const h = t.holders ?? 0
        return !t.holdersVerified || h <= 20
      })
      .slice(0, 20)
    for (const t of batch) {
      void this.holderEnrichment.enrichMint(t.mint)
    }
  }

  private enrichFromMarketState(mint: string, token: FeedToken): FeedToken {
    const fromState = this.tokenFromMarketState(mint)
    const chain = this.holderEnrichment.getCached(mint)
    const { holders, holdersVerified } = this.resolveStableHolders(mint, token, chain)

    if (!fromState) {
      const next = this.attachActivity({ ...token, holders, holdersVerified }, mint)
      return holders > (token.holders ?? 0) || holdersVerified ? next : this.attachActivity(token, mint)
    }
    const merged: FeedToken = {
      ...token,
      ...fromState,
      name: fromState.name !== 'Unknown' ? fromState.name : token.name,
      symbol: fromState.symbol || token.symbol,
      image: this.pickFeedImage(mint, token.image, fromState.image),
      metadataUri: token.metadataUri ?? fromState.metadataUri ?? this.metadata.getEnrichment(mint)?.metadataUri,
      twitter: token.twitter ?? fromState.twitter,
      telegram: token.telegram ?? fromState.telegram,
      website: token.website ?? fromState.website,
      bondingCurvePercent: Math.max(token.bondingCurvePercent ?? 0, fromState.bondingCurvePercent),
      holders: Math.max(
        holders,
        holdersVerified ? (token.holders ?? 0) : 0,
        fromState.holders ?? 0,
      ),
      holdersVerified: holdersVerified || fromState.holdersVerified,
      volume24h: Math.max(token.volume24h ?? 0, fromState.volume24h),
      launchedAt: token.launchedAt || fromState.launchedAt,
      priceChange24h: fromState.priceChange24h ?? token.priceChange24h ?? 0,
    }
    return this.attachActivity(merged, mint)
  }

  private formatDb(t: {
    mint: string
    name: string
    symbol: string
    image: string | null
    marketCap: number
    bondingCurvePercent: number
    holders: number
    volume24h: number
    aiRiskScore: number
    momentumScore: number
    whaleActivity: string
    priceUsd: number
    priceChange24h: number
    liquidity: number
    launchedAt: Date
  }): FeedToken {
    return {
      mint: t.mint,
      name: t.name,
      symbol: t.symbol,
      image: t.image ?? resolveTokenImage(t.mint),
      marketCap: t.marketCap,
      bondingCurvePercent: t.bondingCurvePercent,
      holders: t.holders,
      volume24h: t.volume24h,
      signalScore: t.aiRiskScore,
      momentumScore: t.momentumScore,
      whaleActivity: t.whaleActivity as 'low' | 'medium' | 'high',
      launchedAt: t.launchedAt.toISOString(),
      priceUsd: t.priceUsd,
      priceChange24h: t.priceChange24h,
      liquidity: t.liquidity,
    }
  }
}

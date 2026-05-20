import { Injectable, Logger } from '@nestjs/common'
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
  countUniqueHolders,
} from '@phronis/trading'
import { marketCapUsdFromSol, normalizeVirtualSol, resolveTokenImage } from '@phronis/trading'
import { TokenMetadataService } from './token-metadata.service'
import { SupabaseDbService } from '../supabase/supabase-db.service'

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name)

  constructor(
    private prisma: PrismaService,
    private pump: PumpService,
    private pumpportal: PumpPortalService,
    private trading: TradingBridgeService,
    private liveFeed: LiveFeedService,
    private metadata: TokenMetadataService,
    private supabase: SupabaseDbService,
  ) {}

  async getFeed(): Promise<FeedToken[]> {
    const cached = this.liveFeed.getAll(80)
    if (cached.length > 0) {
      void this.bootstrapFeedFromPump().catch((err) =>
        this.logger.debug(`Pump.fun bootstrap skipped: ${(err as Error).message}`),
      )
      return cached
    }
    return this.bootstrapFeedFromPump()
  }

  private async bootstrapFeedFromPump(): Promise<FeedToken[]> {
    const coins = await this.pump.fetchLatestCoins(50)
    const mapped = await Promise.all(coins.map((c) => this.mapCoin(c)))
    this.liveFeed.mergeBootstrap(mapped)
    return this.liveFeed.getAll(80)
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

  getTrades(mint: string, limit = 50): FeedTrade[] {
    const state = this.trading.getState(mint)
    if (!state) return []
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

  getStats() {
    return this.liveFeed.getStats()
  }

  upsertLiveToken(token: FeedToken, options?: { isNew?: boolean; whaleSol?: number }): FeedToken {
    const saved = this.liveFeed.upsert(this.enrichFromMarketState(token.mint, token))
    void this.persistToSupabase(saved, options)
    return saved
  }

  private async persistToSupabase(
    token: FeedToken,
    options?: { isNew?: boolean; whaleSol?: number },
  ) {
    try {
      if (this.supabase.enabled && !this.prisma.enabled) {
        await this.supabase.upsertToken(token)
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
    const coins = await this.pump.fetchLatestCoins(50)
    for (const coin of coins) {
      const mapped = await this.mapCoin(coin)
      this.liveFeed.upsert(mapped)
      if (this.supabase.enabled && !this.prisma.enabled) {
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
    return coins.length
  }

  private async mapCoin(coin: PumpCoin): Promise<FeedToken> {
    const live = this.trading.getState(coin.mint)
    if (live) {
      const base = this.tokenFromMarketState(coin.mint, coin)
      if (base) return base
    }

    const bondingCurvePercent = this.pump.calculateBondingPercent(coin)
    const marketCap = coin.usd_market_cap ?? 0
    const volume24h = coin.usd_24h_volume ?? 0
    const holders = coin.holder_count ?? 0
    const liquidity = this.pump.solReservesToLiquidity(coin.virtual_sol_reserves ?? 0)

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
      image: resolveTokenImage(coin.mint, { image: coin.image_uri }),
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
    const holders = countUniqueHolders(state)

    const mcaps = state.liquidityHistory.map((h) => h.marketCapSol).filter((m) => m > 0)
    let priceChange24h = coin?.price_change_24h ?? 0
    if (mcaps.length >= 2) {
      const first = mcaps[0]
      const last = mcaps[mcaps.length - 1]
      if (first > 0) priceChange24h = ((last - first) / first) * 100
    }

    const momentum = momentumScoreFromMetrics(metrics)
    return {
      mint,
      name: state.name ?? coin?.name ?? 'Unknown',
      symbol: state.symbol ?? coin?.symbol ?? mint.slice(0, 4).toUpperCase(),
      image:
        this.metadata.getCached(mint) ??
        resolveTokenImage(mint, { image: coin?.image_uri }),
      marketCap: state.marketCapUsd || (coin?.usd_market_cap ?? 0),
      bondingCurvePercent: state.bondingCurvePercent,
      holders,
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
  }

  private enrichFromMarketState(mint: string, token: FeedToken): FeedToken {
    const fromState = this.tokenFromMarketState(mint)
    if (!fromState) return token
    return {
      ...token,
      ...fromState,
      name: fromState.name !== 'Unknown' ? fromState.name : token.name,
      symbol: fromState.symbol || token.symbol,
      image: token.image || fromState.image,
      metadataUri: token.metadataUri ?? fromState.metadataUri,
      holders: Math.max(token.holders ?? 0, fromState.holders),
      volume24h: Math.max(token.volume24h ?? 0, fromState.volume24h),
      launchedAt: token.launchedAt || fromState.launchedAt,
    }
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

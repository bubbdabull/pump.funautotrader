import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import WebSocket from 'ws'
import { EventsGateway } from '../events/events.gateway'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { AutoTraderService } from '../autotrader/autotrader.service'
import { TokensService } from '../tokens/tokens.service'
import { TokenMetadataService } from '../tokens/token-metadata.service'
import { LiveFeedService } from '../feed/live-feed.service'
import {
  bondingCurvePercentFromSol,
  marketCapUsdFromSol,
  normalizeVirtualSol,
} from '@phronis/trading'
import type { PumpPortalNewTokenEvent } from './pumpportal.types'
import type { FeedToken } from '../feed/feed.types'

@Injectable()
export class PumpPortalDataGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PumpPortalDataGateway.name)
  private ws: WebSocket | null = null
  private reconnectTimer?: NodeJS.Timeout
  private readonly subscribedMints = new Set<string>()
  private readonly pendingTradeSubs = new Set<string>()
  private maxTradeSubscriptions = 40
  private tradeSubFlushTimer?: NodeJS.Timeout
  private messageCount = 0
  private lastMessageAt?: string
  private connected = false
  private readonly apiKey: string | undefined

  constructor(
    private config: ConfigService,
    private events: EventsGateway,
    private trading: TradingBridgeService,
    private autoTrader: AutoTraderService,
    private tokens: TokensService,
    private liveFeed: LiveFeedService,
    private metadata: TokenMetadataService,
  ) {
    this.apiKey = this.config.get<string>('PUMPPORTAL_API_KEY')?.trim() || undefined
  }

  getStatus() {
    return {
      connected: this.connected,
      apiKeyConfigured: Boolean(this.apiKey),
      tradeSubscriptionsEnabled: Boolean(this.apiKey),
      messagesReceived: this.messageCount,
      lastMessageAt: this.lastMessageAt,
      subscribedTradeMints: this.subscribedMints.size,
      feedTokens: this.liveFeed.getAll(10).length,
    }
  }

  onModuleInit() {
    if (this.apiKey) {
      this.logger.log('PumpPortal API key loaded — trade streams enabled')
    } else {
      this.logger.warn(
        'PUMPPORTAL_API_KEY not set in server/.env — only free streams (newToken, migration)',
      )
    }
    this.connect()
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.tradeSubFlushTimer) clearTimeout(this.tradeSubFlushTimer)
    this.ws?.close()
  }

  private wsUrl(): string {
    const base = this.config.get('PUMPPORTAL_WS_URL') || 'wss://pumpportal.fun/api/data'
    if (!this.apiKey) return base
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}api-key=${encodeURIComponent(this.apiKey)}`
  }

  private connect() {
    const url = this.wsUrl()
    this.ws = new WebSocket(url)

    this.ws.on('open', () => {
      this.connected = true
      this.logger.log(`PumpPortal WS connected (${this.apiKey ? 'authenticated' : 'public'})`)
      this.ws?.send(JSON.stringify({ method: 'subscribeNewToken' }))
      this.ws?.send(JSON.stringify({ method: 'subscribeMigration' }))
      void this.subscribeTradesForExistingFeed()
    })

    this.ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as Record<string, unknown>
        this.messageCount++
        this.lastMessageAt = new Date().toISOString()
        this.handleMessage(data)
      } catch (err) {
        this.logger.warn(`Invalid WS message: ${(err as Error).message}`)
      }
    })

    this.ws.on('close', () => {
      this.connected = false
      this.logger.warn('PumpPortal WS closed — reconnecting in 5s')
      this.reconnectTimer = setTimeout(() => this.connect(), 5000)
    })

    this.ws.on('error', (err) => {
      this.logger.error(`PumpPortal WS error: ${err.message}`)
    })
  }

  private async subscribeTradesForExistingFeed() {
    if (!this.apiKey) return
    try {
      const feed = await this.tokens.getFeed()
      for (const t of feed.slice(0, 25)) {
        this.subscribeTokenTrades(t.mint)
      }
    } catch {
      /* feed bootstrap optional */
    }
  }

  private subscribeTokenTrades(mint: string) {
    if (!this.apiKey) return
    if (this.subscribedMints.has(mint)) return

    this.pendingTradeSubs.add(mint)
    if (this.tradeSubFlushTimer) return

    this.tradeSubFlushTimer = setTimeout(() => {
      this.tradeSubFlushTimer = undefined
      const batch = [...this.pendingTradeSubs]
      this.pendingTradeSubs.clear()

      const keys: string[] = []
      for (const m of batch) {
        if (this.subscribedMints.has(m)) continue
        if (this.subscribedMints.size >= this.maxTradeSubscriptions) break
        this.subscribedMints.add(m)
        keys.push(m)
      }

      if (!keys.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

      this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys }))
      this.logger.log(`Subscribed to trades for ${keys.length} token(s)`)
    }, 500)
  }

  private handleMessage(data: Record<string, unknown>) {
    const mint = this.extractMint(data)
    if (!mint) return

    const txType = String(data.txType ?? data.type ?? '').toLowerCase()

    if (txType === 'buy' || txType === 'sell') {
      const sol = Number(data.solAmount ?? data.sol_amount ?? 0)
      this.ingestTrade(mint, data, txType as 'buy' | 'sell')
      void this.publishTokenUpdate(mint, sol)
      return
    }

    if (txType === 'create' || txType === 'new' || data.name || data.symbol) {
      this.handleNewToken(mint, data)
      if (Number(data.solAmount ?? 0) > 0) {
        this.ingestTrade(mint, data, 'buy')
      }
      return
    }

    if (txType === 'migrate' || txType === 'migration') {
      void this.publishTokenUpdate(mint)
    }
  }

  private extractMint(data: Record<string, unknown>): string | null {
    const m = data.mint ?? data.tokenMint ?? data.token
    return typeof m === 'string' && m.length > 30 ? m : null
  }

  private ingestTrade(mint: string, data: Record<string, unknown>, side: 'buy' | 'sell') {
    this.autoTrader.ingestTradeEvent({
      mint,
      txType: side,
      solAmount: Number(data.solAmount ?? data.sol_amount ?? 0),
      tokenAmount: Number(data.tokenAmount ?? data.token_amount ?? 0),
      traderPublicKey: (data.traderPublicKey ?? data.trader ?? data.user) as string | undefined,
      signature: data.signature as string | undefined,
      vSolInBondingCurve: Number(data.vSolInBondingCurve ?? 0) || undefined,
      marketCapSol: Number(data.marketCapSol ?? data.market_cap_sol ?? 0) || undefined,
    })
  }

  private handleNewToken(mint: string, data: Record<string, unknown>) {
    const event = data as unknown as PumpPortalNewTokenEvent
    this.trading.ingestNewToken({
      mint,
      symbol: (data.symbol as string) ?? event.symbol,
      name: (data.name as string) ?? event.name,
      vSolInBondingCurve: Number(data.vSolInBondingCurve ?? event.vSolInBondingCurve ?? 0) || undefined,
      vTokensInBondingCurve:
        Number(data.vTokensInBondingCurve ?? event.vTokensInBondingCurve ?? 0) || undefined,
      marketCapSol: Number(data.marketCapSol ?? event.marketCapSol ?? 0) || undefined,
      traderPublicKey: (data.traderPublicKey ?? data.trader) as string | undefined,
    })

    const token = this.buildFeedToken({ ...event, mint, ...data })
    const saved = this.tokens.upsertLiveToken(token, { isNew: true })
    this.events.server?.emit('pumpportal:newToken', saved)
    this.events.server?.to('feed').emit('feed:prepend', saved)
    this.logger.log(`New token: ${saved.symbol} (${mint.slice(0, 8)}…)`)

    void this.enrichTokenImage(mint, {
      uri: (data.uri as string) ?? event.uri,
      image: data.image as string | undefined,
    })

    this.subscribeTokenTrades(mint)

    const signal = this.autoTrader.evaluateNewToken({ ...event, mint })
    if (signal) {
      this.events.server?.emit('autotrader:signal', signal)
    }
  }

  private async publishTokenUpdate(mint: string, whaleSol?: number) {
    const token = await this.tokens.getToken(mint)
    if (!token) return
    const saved = this.tokens.upsertLiveToken(token, { whaleSol })
    this.events.server?.emit('token:update', saved)
    this.events.server?.to('feed').emit('feed:patch', saved)
  }

  private buildFeedToken(data: PumpPortalNewTokenEvent & Record<string, unknown>): FeedToken {
    const vSol = normalizeVirtualSol(
      Number(data.vSolInBondingCurve ?? data.marketCapSol ?? 0),
    )
    const mcSol = normalizeVirtualSol(Number(data.marketCapSol ?? 0))
    const curve = bondingCurvePercentFromSol(vSol || mcSol)
    const marketCap = marketCapUsdFromSol(mcSol || vSol)
    const initialVol = Number(data.solAmount ?? 0)

    const scores = this.trading.scoreStatic({
      mint: data.mint,
      bondingCurvePercent: curve,
      marketCap,
      volume24h: initialVol || vSol,
      holders: 1,
      symbol: data.symbol,
      name: data.name,
    })

    return {
      mint: data.mint,
      name: (data.name as string) ?? 'Unknown',
      symbol: (data.symbol as string) ?? data.mint.slice(0, 4).toUpperCase(),
      image: this.metadata.resolveSync(data.mint, {
        uri: data.uri as string | undefined,
        image: data.image as string | undefined,
      }),
      marketCap,
      bondingCurvePercent: curve,
      holders: 1,
      volume24h: initialVol,
      signalScore: scores.signalScore,
      momentumScore: scores.momentumScore,
      whaleActivity: 'low',
      launchedAt: new Date().toISOString(),
      priceUsd: marketCap > 0 ? marketCap / 1_000_000_000 : 0,
      priceChange24h: 0,
      liquidity: vSol,
    }
  }

  private async enrichTokenImage(
    mint: string,
    fields: { uri?: string; image?: string },
  ) {
    try {
      const imageUrl = await this.metadata.enrichImage(mint, fields)
      const current = this.liveFeed.get(mint)
      if (!current || current.image === imageUrl) return
      const updated = this.tokens.upsertLiveToken({ ...current, image: imageUrl })
      this.events.server?.to('feed').emit('feed:patch', updated)
      this.events.server?.emit('token:update', updated)
    } catch (err) {
      this.logger.debug(`Image enrich failed for ${mint}: ${(err as Error).message}`)
    }
  }
}

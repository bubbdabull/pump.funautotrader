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
import { pickMintsForTradeSubscription } from './trade-subscription.util'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { QuantEngineService } from '../quant/quant-engine.service'

@Injectable()
export class PumpPortalDataGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PumpPortalDataGateway.name)
  private ws: WebSocket | null = null
  private reconnectTimer?: NodeJS.Timeout
  private rotationTimer?: NodeJS.Timeout
  private readonly subscribedMints = new Set<string>()
  private readonly pendingTradeQueue: string[] = []
  private readonly maxTradeSubscriptions: number
  private readonly tradeSubBatchSize: number
  private tradeSubFlushTimer?: NodeJS.Timeout
  private messageCount = 0
  private lastMessageAt?: string
  private lastRotationAt?: string
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
    private ingestion: IngestionOrchestratorService,
    private quant: QuantEngineService,
  ) {
    this.apiKey = this.config.get<string>('PUMPPORTAL_API_KEY')?.trim() || undefined
    const max = Number(this.config.get('PUMPPORTAL_MAX_TRADE_SUBS') ?? 250)
    this.maxTradeSubscriptions = Number.isFinite(max) && max >= 10 ? Math.min(max, 2000) : 250
    const batch = Number(this.config.get('PUMPPORTAL_TRADE_SUB_BATCH') ?? 80)
    this.tradeSubBatchSize = Number.isFinite(batch) && batch >= 1 ? Math.min(batch, 500) : 80
  }

  getStatus() {
    return {
      connected: this.connected,
      apiKeyConfigured: Boolean(this.apiKey),
      tradeSubscriptionsEnabled: Boolean(this.apiKey),
      maxTradeSubscriptions: this.maxTradeSubscriptions,
      subscribedTradeMints: this.subscribedMints.size,
      pendingTradeSubscriptions: this.pendingTradeQueue.length,
      pinnedPriorityMints: this.autoTrader.getPriorityMints().length,
      liveFeedMax: this.liveFeed.getMaxFeed(),
      liveFeedCount: this.liveFeed.getAll().length,
      messagesReceived: this.messageCount,
      lastMessageAt: this.lastMessageAt,
      lastTradeSubRotationAt: this.lastRotationAt,
      streams: ['subscribeNewToken', 'subscribeMigration', this.apiKey ? 'subscribeTokenTrade' : null].filter(
        Boolean,
      ),
    }
  }

  onModuleInit() {
    if (this.apiKey) {
      this.logger.log(
        `PumpPortal API key loaded — trade streams up to ${this.maxTradeSubscriptions} mints`,
      )
    } else {
      this.logger.warn(
        'PUMPPORTAL_API_KEY not set — only free streams (newToken, migration). Set key on Fly for trade ticks.',
      )
    }
    this.connect()
    const rotateMs = Number(this.config.get('PUMPPORTAL_TRADE_SUB_ROTATE_MS') ?? 45_000)
    if (this.apiKey && Number.isFinite(rotateMs) && rotateMs >= 15_000) {
      this.rotationTimer = setInterval(() => void this.rotateTradeSubscriptions(), rotateMs)
    }
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.tradeSubFlushTimer) clearTimeout(this.tradeSubFlushTimer)
    if (this.rotationTimer) clearInterval(this.rotationTimer)
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
      this.subscribedMints.clear()
      this.pendingTradeQueue.length = 0
      this.logger.log(`PumpPortal WS connected (${this.apiKey ? 'authenticated' : 'public'})`)
      this.ws?.send(JSON.stringify({ method: 'subscribeNewToken' }))
      this.ws?.send(JSON.stringify({ method: 'subscribeMigration' }))
      void this.rotateTradeSubscriptions()
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

  /** Subscribe trade streams for highest-value mints in the live feed. */
  private async rotateTradeSubscriptions() {
    if (!this.apiKey || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const feed = this.liveFeed.getAll()
    const pinned = new Set(this.autoTrader.getPriorityMints())
    const slotsLeft = Math.max(0, this.maxTradeSubscriptions - this.subscribedMints.size)
    if (slotsLeft === 0) return

    const picks = pickMintsForTradeSubscription(feed, pinned, slotsLeft, this.subscribedMints)
    for (const mint of picks) {
      this.queueTradeSubscription(mint, true)
    }
    this.lastRotationAt = new Date().toISOString()
    if (picks.length) {
      this.logger.debug(`Trade sub rotation: queued ${picks.length} mint(s)`)
    }
  }

  private queueTradeSubscription(mint: string, front = false) {
    if (!this.apiKey) return
    if (this.subscribedMints.has(mint)) return

    const idx = this.pendingTradeQueue.indexOf(mint)
    if (idx >= 0) this.pendingTradeQueue.splice(idx, 1)
    if (front) this.pendingTradeQueue.unshift(mint)
    else this.pendingTradeQueue.push(mint)

    if (this.tradeSubFlushTimer) return
    this.tradeSubFlushTimer = setTimeout(() => {
      this.tradeSubFlushTimer = undefined
      this.flushTradeSubscriptions()
    }, 400)
  }

  private flushTradeSubscriptions() {
    const batch: string[] = []
    while (
      this.pendingTradeQueue.length > 0 &&
      this.subscribedMints.size < this.maxTradeSubscriptions &&
      batch.length < this.tradeSubBatchSize
    ) {
      const m = this.pendingTradeQueue.shift()!
      if (this.subscribedMints.has(m)) continue
      this.subscribedMints.add(m)
      batch.push(m)
    }

    if (!batch.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

    this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: batch }))
    this.logger.log(
      `Subscribed to trades for ${batch.length} token(s) (${this.subscribedMints.size}/${this.maxTradeSubscriptions})`,
    )

    if (
      this.pendingTradeQueue.length > 0 &&
      this.subscribedMints.size < this.maxTradeSubscriptions
    ) {
      this.tradeSubFlushTimer = setTimeout(() => {
        this.tradeSubFlushTimer = undefined
        this.flushTradeSubscriptions()
      }, 300)
    }
  }

  private handleMessage(data: Record<string, unknown>) {
    const mint = this.extractMint(data)
    if (!mint) return

    const txType = String(data.txType ?? data.type ?? '').toLowerCase()

    if (txType === 'buy' || txType === 'sell') {
      const sol = Number(data.solAmount ?? data.sol_amount ?? 0)
      void this.ingestTrade(mint, data, txType as 'buy' | 'sell').then(() =>
        this.publishTokenUpdate(mint, sol),
      )
      return
    }

    if (txType === 'create' || txType === 'new' || data.name || data.symbol) {
      this.handleNewToken(mint, data)
      if (Number(data.solAmount ?? 0) > 0) {
        void this.ingestTrade(mint, data, 'buy')
      }
      return
    }

    if (txType === 'migrate' || txType === 'migration') {
      const live = this.liveFeed.get(mint)
      if (live) {
        const saved = this.tokens.upsertLiveToken({ ...live, bondingCurvePercent: 100 })
        this.events.server?.emit('token:graduating', saved)
        this.events.server?.to('feed').emit('feed:patch', saved)
      }
      void this.publishTokenUpdate(mint)
      this.autoTrader.pinTradeStream(mint)
      this.queueTradeSubscription(mint, true)
      void this.publishIngest('token.migration', mint, data, `migrate-${mint}`)
    }
  }

  private extractMint(data: Record<string, unknown>): string | null {
    const m = data.mint ?? data.tokenMint ?? data.token
    return typeof m === 'string' && m.length > 30 ? m : null
  }

  private async publishIngest(
    type: 'token.launch' | 'token.trade' | 'token.migration',
    mint: string,
    payload: Record<string, unknown>,
    id?: string,
  ) {
    await this.ingestion.processImmediate({
      id: id ?? `${mint}-${Date.now()}`,
      source: 'pumpportal',
      type,
      mint,
      payload,
      receivedAt: Date.now(),
    })
  }

  private async ingestTrade(mint: string, data: Record<string, unknown>, side: 'buy' | 'sell') {
    await this.publishIngest(
      'token.trade',
      mint,
      {
        ...data,
        txType: side,
        solAmount: Number(data.solAmount ?? data.sol_amount ?? 0),
        tokenAmount: Number(data.tokenAmount ?? data.token_amount ?? 0),
        traderPublicKey: data.traderPublicKey ?? data.trader,
        signature: data.signature,
      },
      (data.signature as string) ?? undefined,
    )
  }

  private async handleNewToken(mint: string, data: Record<string, unknown>) {
    const event = data as unknown as PumpPortalNewTokenEvent

    const token = this.buildFeedToken({ ...event, mint, ...data })
    const saved = this.tokens.upsertLiveToken(token, { isNew: true })
    this.events.server?.emit('pumpportal:newToken', saved)
    if (saved.bondingCurvePercent < 78) {
      this.events.server?.to('feed').emit('feed:prepend', saved)
    } else {
      this.events.server?.emit('token:graduating', saved)
    }
    this.logger.log(`New token: ${saved.symbol} (${mint.slice(0, 8)}…)`)

    void this.enrichTokenImage(mint, {
      uri: (data.uri as string) ?? event.uri,
      image: data.image as string | undefined,
    })

    this.autoTrader.pinTradeStream(mint)
    this.queueTradeSubscription(mint, true)

    await this.publishIngest('token.launch', mint, { ...event, mint, ...data }, mint)

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

    const uri = (data.uri as string) ?? undefined
    return {
      mint: data.mint,
      name: (data.name as string) ?? 'Unknown',
      symbol: (data.symbol as string) ?? data.mint.slice(0, 4).toUpperCase(),
      image: this.metadata.resolveSync(data.mint, {
        uri,
        image: data.image as string | undefined,
      }),
      metadataUri: uri,
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
      const updated = this.tokens.upsertLiveToken({
        ...current,
        image: imageUrl,
        metadataUri: fields.uri ?? current.metadataUri,
      })
      this.events.server?.to('feed').emit('feed:patch', updated)
      this.events.server?.emit('token:update', updated)
    } catch (err) {
      this.logger.debug(`Image enrich failed for ${mint}: ${(err as Error).message}`)
    }
  }
}

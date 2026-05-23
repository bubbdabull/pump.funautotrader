import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy, forwardRef } from '@nestjs/common'
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
  coalesceTokenImage,
  isUsableTokenImageUrl,
  normalizeFeedTokenLabels,
  pickTokenName,
  pickTokenSymbol,
  isValidTicker,
  normalizePumpPortalTrade,
  FEED_TRADE_PIN_MAX,
  PUMPPORTAL_WS_HEARTBEAT_MS,
  PUMPPORTAL_WS_STALE_MS,
} from '@phronis/trading'
import { PumpService } from '../pump/pump.service'
import type { PumpPortalNewTokenEvent } from './pumpportal.types'
import type { FeedToken } from '../feed/feed.types'
import { pickMintsForTradeSubscription } from './trade-subscription.util'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { QuantEngineService } from '../quant/quant-engine.service'
import { HolderEnrichmentService } from '../holders/holder-enrichment.service'
import { FeedTradePinService } from '../trade-data/feed-trade-pin.service'
import { HotMintsService } from '../trade-data/hot-mints.service'

@Injectable()
export class PumpPortalDataGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PumpPortalDataGateway.name)
  private ws: WebSocket | null = null
  private reconnectTimer?: NodeJS.Timeout
  private rotationTimer?: NodeJS.Timeout
  private readonly subscribedMints = new Set<string>()
  private readonly pendingTradeQueue: string[] = []
  private readonly maxPendingTradeQueue: number
  private readonly maxTradeSubscriptions: number
  private readonly tradeSubBatchSize: number
  private tradeSubFlushTimer?: NodeJS.Timeout
  private messageCount = 0
  private tradeMessageCount = 0
  private lastMessageAt?: string
  private lastMessageAtMs = 0
  private heartbeatTimer?: NodeJS.Timeout
  private lastRotationAt?: string
  private connected = false
  private readonly apiKey: string | undefined

  constructor(
    private config: ConfigService,
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
    private trading: TradingBridgeService,
    private autoTrader: AutoTraderService,
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    private liveFeed: LiveFeedService,
    private metadata: TokenMetadataService,
    private pump: PumpService,
    private ingestion: IngestionOrchestratorService,
    @Inject(forwardRef(() => QuantEngineService))
    private quant: QuantEngineService,
    @Inject(forwardRef(() => HolderEnrichmentService))
    private holderEnrichment: HolderEnrichmentService,
    private feedTradePin: FeedTradePinService,
    private hotMints: HotMintsService,
  ) {
    this.apiKey = this.config.get<string>('PUMPPORTAL_API_KEY')?.trim() || undefined
    const max = Number(this.config.get('PUMPPORTAL_MAX_TRADE_SUBS') ?? FEED_TRADE_PIN_MAX)
    this.maxTradeSubscriptions =
      Number.isFinite(max) && max >= 10 ? Math.min(max, 2000) : FEED_TRADE_PIN_MAX
    const batch = Number(this.config.get('PUMPPORTAL_TRADE_SUB_BATCH') ?? 80)
    this.tradeSubBatchSize = Number.isFinite(batch) && batch >= 1 ? Math.min(batch, 500) : 80
    this.maxPendingTradeQueue = Math.max(this.maxTradeSubscriptions * 2, 400)
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
      tradeMessagesReceived: this.tradeMessageCount,
      lastMessageAt: this.lastMessageAt,
      lastMessageAgeMs: this.lastMessageAtMs ? Date.now() - this.lastMessageAtMs : null,
      staleThresholdMs: PUMPPORTAL_WS_STALE_MS,
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
    this.heartbeatTimer = setInterval(() => this.heartbeatCheck(), PUMPPORTAL_WS_HEARTBEAT_MS)
    const rotateMs = Number(this.config.get('PUMPPORTAL_TRADE_SUB_ROTATE_MS') ?? 20_000)
    if (this.apiKey && Number.isFinite(rotateMs) && rotateMs >= 15_000) {
      this.rotationTimer = setInterval(() => void this.rotateTradeSubscriptions(), rotateMs)
    }
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.tradeSubFlushTimer) clearTimeout(this.tradeSubFlushTimer)
    if (this.rotationTimer) clearInterval(this.rotationTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.ws?.close()
  }

  private wsUrl(): string {
    const base = this.config.get('PUMPPORTAL_WS_URL') || 'wss://pumpportal.fun/api/data'
    if (!this.apiKey) return base
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}api-key=${encodeURIComponent(this.apiKey)}`
  }

  private heartbeatCheck() {
    if (!this.connected || !this.ws) return
    const age = this.lastMessageAtMs ? Date.now() - this.lastMessageAtMs : Infinity
    if (age > PUMPPORTAL_WS_STALE_MS) {
      this.logger.warn(`PumpPortal WS stale (${Math.round(age / 1000)}s) — forcing reconnect`)
      this.ws.terminate()
    }
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
        this.lastMessageAtMs = Date.now()
        this.lastMessageAt = new Date(this.lastMessageAtMs).toISOString()
        this.dispatchMessage(data)
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

  /** Subscribe trade streams — feed tradeable mints first, then rotate extras. */
  private async rotateTradeSubscriptions() {
    if (!this.apiKey || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

    this.feedTradePin.refreshPinsFromFeed()
    const feed = this.liveFeed.getAll()
    const pinned = new Set([
      ...this.autoTrader.getPriorityMints(),
      ...this.feedTradePin.getMandatoryMints(),
    ])
    const mandatory = [
      ...this.hotMints.getHotMints(80),
      ...this.feedTradePin.getMandatoryMints(),
    ]
    const mandatoryUnique = [...new Set(mandatory)]

    for (const mint of mandatoryUnique) {
      while (
        this.subscribedMints.size >= this.maxTradeSubscriptions &&
        !this.subscribedMints.has(mint)
      ) {
        if (!this.evictOneNonPinned(pinned)) break
      }
      this.queueTradeSubscription(mint, true)
    }

    const slotsLeft = Math.max(0, this.maxTradeSubscriptions - this.subscribedMints.size)
    const picks = pickMintsForTradeSubscription(
      feed,
      pinned,
      slotsLeft,
      this.subscribedMints,
      mandatoryUnique,
    )
    for (const mint of picks) {
      this.queueTradeSubscription(mint, true)
    }
    this.lastRotationAt = new Date().toISOString()
    if (picks.length || mandatoryUnique.length) {
      this.logger.debug(
        `Trade subs: mandatory=${mandatoryUnique.length} queued=${picks.length} active=${this.subscribedMints.size}/${this.maxTradeSubscriptions} pending=${this.pendingTradeQueue.length}`,
      )
    }
  }

  /** Drop a subscribed mint that is not pinned to make room for feed tokens. */
  private evictOneNonPinned(pinned: ReadonlySet<string>): boolean {
    const hot = new Set(this.hotMints.getHotMints(120, 180_000))
    const candidates = [...this.subscribedMints].filter((m) => !pinned.has(m) && !hot.has(m))
    const victim = candidates[0]
    if (!victim) {
      for (const mint of this.subscribedMints) {
        if (!pinned.has(mint)) {
          this.unsubscribeTradeMints([mint])
          return true
        }
      }
      return false
    }
    this.unsubscribeTradeMints([victim])
    return true
  }

  private unsubscribeTradeMints(mints: string[]) {
    if (!mints.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ method: 'unsubscribeTokenTrade', keys: mints }))
    for (const m of mints) this.subscribedMints.delete(m)
  }

  private queueTradeSubscription(mint: string, front = false) {
    if (!this.apiKey) return
    if (this.subscribedMints.has(mint)) return

    const idx = this.pendingTradeQueue.indexOf(mint)
    if (idx >= 0) this.pendingTradeQueue.splice(idx, 1)
    if (front) this.pendingTradeQueue.unshift(mint)
    else this.pendingTradeQueue.push(mint)

    while (this.pendingTradeQueue.length > this.maxPendingTradeQueue) {
      this.pendingTradeQueue.pop()
    }

    if (this.tradeSubFlushTimer) return
    this.tradeSubFlushTimer = setTimeout(() => {
      this.tradeSubFlushTimer = undefined
      this.flushTradeSubscriptions()
    }, 400)
  }

  flushTradeSubscriptions() {
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

  /** Force PumpPortal trade stream for a mint (token page / chart). */
  ensureTradeSubscription(mint: string): { queued: boolean; subscribed: boolean } {
    if (!this.apiKey) return { queued: false, subscribed: false }
    this.autoTrader.pinTradeStream(mint)
    const pinned = new Set([
      mint,
      ...this.autoTrader.getPriorityMints(),
      ...this.feedTradePin.getMandatoryMints(),
    ])
    while (
      this.subscribedMints.size >= this.maxTradeSubscriptions &&
      !this.subscribedMints.has(mint)
    ) {
      if (!this.evictOneNonPinned(pinned)) break
    }
    this.queueTradeSubscription(mint, true)
    if (this.ws?.readyState === WebSocket.OPEN) {
      void this.flushTradeSubscriptions()
    }
    return { queued: true, subscribed: this.subscribedMints.has(mint) }
  }

  isTradeSubscribed(mint: string): boolean {
    return this.subscribedMints.has(mint)
  }

  private extractSolAmount(data: Record<string, unknown>): number {
    const direct = Number(
      data.solAmount ??
        data.sol_amount ??
        data.sol ??
        data.amount ??
        data.nativeAmount ??
        0,
    )
    if (direct > 0) return direct

    const tokenAmt = Number(
      data.tokenAmount ?? data.token_amount ?? data.newTokenBalance ?? 0,
    )
    const mcapSol = Number(data.marketCapSol ?? data.market_cap_sol ?? 0)
    if (tokenAmt > 0 && mcapSol > 1) {
      return Math.max(0.002, (tokenAmt / 1_000_000_000) * mcapSol * 0.015)
    }
    return 0
  }

  private parseTradeSide(data: Record<string, unknown>): 'buy' | 'sell' | null {
    const normalized = normalizePumpPortalTrade(data)
    return normalized?.side ?? null
  }

  private isLaunchMessage(data: Record<string, unknown>, txType: string): boolean {
    if (txType === 'create' || txType === 'new' || txType === 'launch') return true
    const hasLaunchMeta = Boolean(data.name || data.symbol || data.uri)
    const tradeSide = this.parseTradeSide(data)
    if (hasLaunchMeta && !tradeSide) return true
    return false
  }

  private dispatchMessage(data: unknown) {
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === 'object') {
          this.handleMessage(item as Record<string, unknown>)
        }
      }
      return
    }
    if (data && typeof data === 'object') {
      const rec = data as Record<string, unknown>
      const nested = rec.data ?? rec.payload ?? rec.message
      if (nested && typeof nested === 'object' && !rec.mint) {
        this.handleMessage(nested as Record<string, unknown>)
        return
      }
      this.handleMessage(rec)
    }
  }

  private handleMessage(data: Record<string, unknown>) {
    const mint = this.extractMint(data)
    if (!mint) return

    const txType = String(data.txType ?? data.type ?? '').toLowerCase()
    const tradeSide = this.parseTradeSide(data)

    if (tradeSide) {
      this.tradeMessageCount++
      const normalized = normalizePumpPortalTrade(data)
      const sol = normalized?.solAmount ?? (this.extractSolAmount(data) || 0.005)
      this.hotMints.recordTrade(mint, normalized?.timestampMs)
      void this.ingestTrade(mint, data, tradeSide, normalized)
      return
    }

    if (this.isLaunchMessage(data, txType)) {
      const initialSol = this.extractSolAmount(data) || Number(data.initialBuy ?? 0) * 1e-9
      void this.handleNewToken(mint, data, initialSol)
      if (initialSol >= 0.08) {
        this.tradeMessageCount++
        this.hotMints.recordTrade(mint)
        void this.ingestTrade(mint, data, 'buy', normalizePumpPortalTrade({ ...data, txType: 'buy' }) ?? undefined)
      }
      return
    }

    if (txType === 'migrate' || txType === 'migration') {
      const live = this.liveFeed.get(mint)
      if (live) {
        const saved = this.tokens.upsertLiveToken({ ...live, bondingCurvePercent: 100 })
        if (saved) {
          this.events.server?.emit('token:graduating', saved)
          this.events.server?.to('feed').emit('feed:patch', saved)
        }
      }
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

  private async ingestTrade(
    mint: string,
    data: Record<string, unknown>,
    side: 'buy' | 'sell',
    normalized?: ReturnType<typeof normalizePumpPortalTrade>,
  ) {
    const norm = normalized ?? normalizePumpPortalTrade({ ...data, txType: side })
    const sol = norm?.solAmount ?? this.extractSolAmount(data)
    await this.publishIngest(
      'token.trade',
      mint,
      {
        ...data,
        txType: side,
        solAmount: sol,
        tokenAmount: norm?.tokenAmount ?? Number(data.tokenAmount ?? data.token_amount ?? 0),
        traderPublicKey: norm?.traderPublicKey,
        signature: norm?.signature ?? data.signature,
        timestamp: norm?.timestampMs,
        slot: norm?.slot,
        newTokenBalance: norm?.newTokenBalance,
        vSolInBondingCurve: norm?.vSolInBondingCurve,
        marketCapSol: norm?.marketCapSol,
      },
      (norm?.signature as string) ?? undefined,
    )
  }

  private async handleNewToken(
    mint: string,
    data: Record<string, unknown>,
    initialSol = 0,
  ) {
    const event = data as unknown as PumpPortalNewTokenEvent

    const token = this.buildFeedToken({ ...event, mint, ...data })
    const saved = this.tokens.upsertLiveToken(token, { isNew: true })
    this.events.server?.emit('pumpportal:newToken', saved ?? token)
    if (saved) {
      if (saved.bondingCurvePercent >= 78) {
        this.events.server?.emit('token:graduating', saved)
      }
      this.logger.log(`Tradeable: ${saved.symbol} (${mint.slice(0, 8)}…)`)
    } else {
      this.logger.debug(`Tracking ${token.symbol} (${mint.slice(0, 8)}…) — not tradeable yet`)
    }

    void this.enrichTokenMedia(mint, {
      uri: (data.uri as string) ?? event.uri,
      image: (data.image as string) ?? undefined,
      metadataUri: (data.metadata_uri as string) ?? (data.uri as string) ?? event.uri,
    })
    void this.holderEnrichment.enrichMint(mint, true)

    this.autoTrader.pinTradeStream(mint)
    this.queueTradeSubscription(mint, true)

    await this.publishIngest('token.launch', mint, { ...event, mint, ...data }, mint)

    void this.autoTrader.evaluateNewToken({ ...event, mint })
  }

  private async publishTokenUpdate(mint: string, whaleSol?: number) {
    const saved = this.tokens.emitFeedPatch(mint, whaleSol)
    if (!saved) {
      const token = await this.tokens.getToken(mint)
      if (!token) return
      const upserted = this.tokens.upsertLiveToken(token, { whaleSol })
      if (!upserted) return
      this.events.server?.emit('token:update', upserted)
      this.events.server?.to('feed').emit('feed:patch', upserted)
    }
    this.events.emitChartUpdate(mint)
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
    const initialBuy = Number(data.initialBuy ?? 0)
    const starterHolders = initialBuy > 0 ? 2 : 1
    const labels = normalizeFeedTokenLabels(data.mint, {
      symbol: data.symbol as string | undefined,
      name: data.name as string | undefined,
    })
    return {
      mint: data.mint,
      name: labels.name,
      symbol: labels.symbol,
      image:
        coalesceTokenImage(data.mint, {
          image: data.image as string | undefined,
          uri,
        }) ||
        this.metadata.resolveSync(data.mint, {
          uri,
          image: data.image as string | undefined,
          metadataUri: uri,
        }),
      metadataUri: uri,
      marketCap,
      bondingCurvePercent: curve,
      holders: starterHolders,
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

  private async enrichTokenMedia(
    mint: string,
    fields: { uri?: string; image?: string; metadataUri?: string },
  ) {
    try {
      let image = fields.image
      let metadataUri = fields.metadataUri ?? fields.uri
      let symbol: string | undefined
      let name: string | undefined
      const live = this.liveFeed.get(mint)
      if (!isUsableTokenImageUrl(image) || !isValidTicker(live?.symbol, mint)) {
        const coin = await this.pump.getCoin(mint)
        if (coin) {
          if (coin.image_uri && isUsableTokenImageUrl(coin.image_uri)) {
            image = coin.image_uri
          }
          metadataUri = metadataUri ?? coin.metadata_uri
          symbol = pickTokenSymbol(mint, live?.symbol, coin.symbol)
          name = pickTokenName(mint, symbol, live?.name, coin.name)
        }
      }
      const labels = normalizeFeedTokenLabels(mint, {
        symbol: symbol ?? live?.symbol,
        name: name ?? live?.name,
      })
      const media = await this.metadata.enrichToken(mint, {
        uri: metadataUri,
        image,
        metadataUri,
      })
      const current = this.liveFeed.get(mint)
      const base = current ?? (await this.tokens.getToken(mint))
      if (!base) return
      const updated =
        this.liveFeed.patch({
          ...base,
          symbol: labels.symbol,
          name: labels.name,
          image: media.image,
          metadataUri: media.metadataUri ?? base.metadataUri,
          twitter: media.twitter ?? base.twitter,
          telegram: media.telegram ?? base.telegram,
          website: media.website ?? base.website,
        }) ??
        (await this.tokens.upsertLiveToken({
          ...base,
          symbol: labels.symbol,
          name: labels.name,
          image: media.image,
          metadataUri: media.metadataUri ?? base.metadataUri,
          twitter: media.twitter ?? base.twitter,
          telegram: media.telegram ?? base.telegram,
          website: media.website ?? base.website,
        }))
      if (!updated) return
      this.events.server?.to('feed').emit('feed:patch', updated)
      this.events.server?.emit('token:update', updated)
    } catch (err) {
      this.logger.debug(`Media enrich failed for ${mint}: ${(err as Error).message}`)
    }
  }
}

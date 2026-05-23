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
  PUMPPORTAL_WS_PING_MS,
  PUMPPORTAL_WS_RECONNECT_BASE_MS,
  PUMPPORTAL_WS_RECONNECT_MAX_MS,
} from '@phronis/trading'
import { PumpService } from '../pump/pump.service'
import type { PumpPortalNewTokenEvent } from './pumpportal.types'
import type { FeedToken } from '../feed/feed.types'
import { pickMintsForTradeSubscription } from './trade-subscription.util'
import { IngestionOrchestratorService } from '../ingestion/ingestion-orchestrator.service'
import { IngestionLeaderService } from '../ingestion/ingestion-leader.service'
import { EventBusService } from '../ingestion/event-bus.service'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'
import { QuantEngineService } from '../quant/quant-engine.service'
import { HolderEnrichmentService } from '../holders/holder-enrichment.service'
import { FeedTradePinService } from '../trade-data/feed-trade-pin.service'
import { HotMintsService } from '../trade-data/hot-mints.service'

@Injectable()
export class PumpPortalDataGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PumpPortalDataGateway.name)
  private ws: WebSocket | null = null
  private reconnectTimer?: NodeJS.Timeout
  private reconnectWatchdog?: NodeJS.Timeout
  private rotationTimer?: NodeJS.Timeout
  private pingTimer?: NodeJS.Timeout
  private connecting = false
  private intentionalClose = false
  private reconnectAttempts = 0
  private droppedMessages = 0
  private parseErrors = 0
  private connectedAtMs = 0
  private lastPongAtMs = 0
  private readonly desiredTradeSubs = new Set<string>()
  private readonly subscribedMints = new Set<string>()
  private readonly pendingTradeQueue: string[] = []
  private readonly ingestQueue: Record<string, unknown>[] = []
  private ingestDraining = false
  private readonly maxIngestQueue = 4_000
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
  private lastSubLogAt = 0
  private connected = false
  private ingestionPaused = true
  private reconnectLocked = false
  private resyncScheduled = false
  private reconnectCooldownUntil = 0
  private streamEpoch = 0
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
    private ingestionLeader: IngestionLeaderService,
    private eventBus: EventBusService,
    private redis: RedisService,
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
      ...this.getHealth(),
      streams: ['subscribeNewToken', 'subscribeMigration', this.apiKey ? 'subscribeTokenTrade' : null].filter(
        Boolean,
      ),
    }
  }

  getHealth() {
    const now = Date.now()
    const msgAge = this.lastMessageAtMs ? now - this.lastMessageAtMs : null
    const uptimeMs = this.connectedAtMs && this.connected ? now - this.connectedAtMs : 0
    let healthScore = 0
    if (this.connected) healthScore += 40
    if (msgAge != null && msgAge < PUMPPORTAL_WS_STALE_MS / 2) healthScore += 35
    else if (msgAge != null && msgAge < PUMPPORTAL_WS_STALE_MS) healthScore += 15
    if (this.apiKey && this.subscribedMints.size >= 10) healthScore += 15
    if (this.ingestQueue.length < 500) healthScore += 10
    return {
      connected: this.connected,
      connecting: this.connecting,
      apiKeyConfigured: Boolean(this.apiKey),
      tradeSubscriptionsEnabled: Boolean(this.apiKey),
      maxTradeSubscriptions: this.maxTradeSubscriptions,
      subscribedTradeMints: this.subscribedMints.size,
      desiredTradeMints: this.desiredTradeSubs.size,
      pendingTradeSubscriptions: this.pendingTradeQueue.length,
      pinnedPriorityMints: this.autoTrader.getPriorityMints().length,
      liveFeedMax: this.liveFeed.getMaxFeed(),
      liveFeedCount: this.liveFeed.getAll().length,
      messagesReceived: this.messageCount,
      tradeMessagesReceived: this.tradeMessageCount,
      droppedMessages: this.droppedMessages,
      parseErrors: this.parseErrors,
      ingestQueueDepth: this.ingestQueue.length,
      reconnectCount: this.reconnectAttempts,
      lastMessageAt: this.lastMessageAt,
      lastMessageAgeMs: msgAge,
      lastPongAgeMs: this.lastPongAtMs ? now - this.lastPongAtMs : null,
      uptimeMs,
      healthScore: Math.min(100, healthScore),
      staleThresholdMs: PUMPPORTAL_WS_STALE_MS,
      lastTradeSubRotationAt: this.lastRotationAt,
      ingestionLeader: this.ingestionLeader.isIngestionLeader(),
      leaderId: this.ingestionLeader.getLeaderId(),
      streamEpoch: this.streamEpoch,
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
    this.ingestionLeader.onLeaderChange((leader) => {
      if (leader) this.beginIngestion()
      else this.standDownIngestion()
    })
  }

  private beginIngestion() {
    this.ingestionPaused = false
    const deferMs =
      Number(process.env.PUMPPORTAL_CONNECT_DEFER_MS ?? 0) ||
      (process.env.FLY_APP_NAME ? 12_000 : 0)
    const recoverySyncMs = Number(process.env.PUMPPORTAL_RECOVERY_SYNC_MS ?? 18_000)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => this.heartbeatCheck(), PUMPPORTAL_WS_HEARTBEAT_MS)
    const rotateMs = Number(this.config.get('PUMPPORTAL_TRADE_SUB_ROTATE_MS') ?? 20_000)
    if (this.rotationTimer) clearInterval(this.rotationTimer)
    if (this.apiKey && Number.isFinite(rotateMs) && rotateMs >= 15_000) {
      this.rotationTimer = setInterval(() => void this.rotateTradeSubscriptions(), rotateMs)
    }
    if (deferMs > 0) {
      this.logger.log(`PumpPortal WS connect deferred ${deferMs}ms (Fly health window)`)
      setTimeout(() => this.connect(), deferMs)
      setTimeout(() => this.resyncAfterRecovery(), deferMs + recoverySyncMs)
    } else {
      this.connect()
      setTimeout(() => this.resyncAfterRecovery(), recoverySyncMs)
    }
  }

  private standDownIngestion() {
    this.ingestionPaused = true
    this.clearReconnectTimers()
    this.teardownSocket()
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer)
      this.rotationTimer = undefined
    }
  }

  private clearReconnectTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    if (this.reconnectWatchdog) {
      clearTimeout(this.reconnectWatchdog)
      this.reconnectWatchdog = undefined
    }
    if (this.tradeSubFlushTimer) {
      clearTimeout(this.tradeSubFlushTimer)
      this.tradeSubFlushTimer = undefined
    }
  }

  onModuleDestroy() {
    this.intentionalClose = true
    this.clearReconnectTimers()
    if (this.rotationTimer) clearInterval(this.rotationTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    try {
      this.ws?.removeAllListeners()
      this.ws?.close()
    } catch {
      /* shutting down */
    }
    this.ws = null
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
      this.forceReconnect('stale')
    }
  }

  private forceReconnect(reason: string) {
    if (this.intentionalClose) return
    try {
      this.ws?.terminate()
    } catch {
      /* already dead */
    }
    this.connected = false
    this.scheduleReconnect(reason)
  }

  private scheduleReconnect(reason: string) {
    if (this.ingestionPaused || this.intentionalClose || this.reconnectTimer) return
    if (Date.now() < this.reconnectCooldownUntil) return
    const exp = Math.min(
      PUMPPORTAL_WS_RECONNECT_MAX_MS,
      PUMPPORTAL_WS_RECONNECT_BASE_MS * 2 ** Math.min(this.reconnectAttempts, 6),
    )
    const jitter = Math.floor(Math.random() * 800)
    const delay = exp + jitter
    this.reconnectAttempts++
    if (this.reconnectAttempts >= 8) {
      this.reconnectCooldownUntil = Date.now() + 30_000
      this.logger.warn('PumpPortal reconnect cooldown 30s after repeated failures')
    }
    this.logger.warn(
      `PumpPortal WS reconnect in ${delay}ms (${reason}, attempt ${this.reconnectAttempts})`,
    )
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, delay)
    if (this.reconnectWatchdog) clearTimeout(this.reconnectWatchdog)
    this.reconnectWatchdog = setTimeout(() => {
      if (
        !this.connected &&
        !this.intentionalClose &&
        !this.ingestionPaused &&
        !this.reconnectLocked
      ) {
        this.logger.warn('PumpPortal reconnect watchdog — retry connect')
        this.connecting = false
        this.connect()
      }
    }, delay + 30_000)
  }

  private teardownSocket() {
    if (!this.ws) return
    try {
      this.ws.removeAllListeners()
      this.ws.terminate()
    } catch {
      /* ignore */
    }
    this.ws = null
    this.connected = false
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = undefined
    }
  }

  private connect() {
    if (this.ingestionPaused || this.intentionalClose) return
    if (this.connecting || this.reconnectLocked) return
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }

    this.reconnectLocked = true
    this.connecting = true
    this.teardownSocket()
    const url = this.wsUrl()
    const socket = new WebSocket(url)
    this.ws = socket

    socket.on('open', () => {
      this.connecting = false
      this.reconnectLocked = false
      this.connected = true
      this.connectedAtMs = Date.now()
      this.lastPongAtMs = Date.now()
      this.reconnectAttempts = 0
      this.reconnectCooldownUntil = 0
      if (this.reconnectWatchdog) {
        clearTimeout(this.reconnectWatchdog)
        this.reconnectWatchdog = undefined
      }
      this.subscribedMints.clear()
      this.pendingTradeQueue.length = 0
      this.trimDesiredTradeSubs()
      this.streamEpoch = Date.now()
      void this.redis.set(REDIS_KEYS.streamEpoch, String(this.streamEpoch))
      this.logger.log(
        `PumpPortal WS connected (${this.apiKey ? 'authenticated' : 'public'})` +
          ` epoch=${this.streamEpoch}`,
      )
      socket.send(JSON.stringify({ method: 'subscribeNewToken' }))
      socket.send(JSON.stringify({ method: 'subscribeMigration' }))
      this.pingTimer = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return
        try {
          socket.ping()
        } catch {
          this.forceReconnect('ping_failed')
        }
      }, PUMPPORTAL_WS_PING_MS)
      void this.schedulePostReconnectResync()
    })

    socket.on('pong', () => {
      this.lastPongAtMs = Date.now()
    })

    socket.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as Record<string, unknown>
        this.messageCount++
        this.lastMessageAtMs = Date.now()
        this.lastMessageAt = new Date(this.lastMessageAtMs).toISOString()
        this.enqueueIngest(data)
      } catch (err) {
        this.parseErrors++
        this.logger.debug(`Invalid WS message: ${(err as Error).message}`)
      }
    })

    socket.on('close', () => {
      this.connecting = false
      this.reconnectLocked = false
      this.connected = false
      this.teardownSocket()
      if (!this.intentionalClose) {
        this.logger.warn('PumpPortal WS closed')
        this.scheduleReconnect('close')
      }
    })

    socket.on('error', (err) => {
      this.connecting = false
      this.reconnectLocked = false
      this.logger.error(`PumpPortal WS error: ${err.message}`)
      if (!this.intentionalClose) this.scheduleReconnect('error')
    })
  }

  private enqueueIngest(data: Record<string, unknown>) {
    if (this.ingestQueue.length >= this.maxIngestQueue) {
      this.ingestQueue.shift()
      this.droppedMessages++
    }
    this.ingestQueue.push(data)
    if (!this.ingestDraining) {
      this.ingestDraining = true
      setImmediate(() => this.drainIngestQueue())
    }
  }

  private drainIngestQueue() {
    const batch = this.ingestQueue.splice(0, 48)
    for (const data of batch) {
      try {
        this.dispatchMessage(data)
      } catch (err) {
        this.droppedMessages++
        this.logger.debug(`Ingest dispatch error: ${(err as Error).message}`)
      }
    }
    if (this.ingestQueue.length > 0) {
      setImmediate(() => this.drainIngestQueue())
    } else {
      this.ingestDraining = false
    }
  }

  /** One rotation + one flush after reconnect — avoids subscription storms. */
  private async schedulePostReconnectResync() {
    if (this.resyncScheduled) return
    this.resyncScheduled = true
    try {
      await this.rotateTradeSubscriptions()
    } finally {
      setTimeout(() => {
        this.resyncScheduled = false
        this.flushTradeSubscriptions()
      }, 600)
    }
  }

  /** Called after Redis snapshot recovery so trade subs align with restored feed. */
  resyncAfterRecovery() {
    if (this.ingestionPaused) return
    if (!this.apiKey) return
    void this.rotateTradeSubscriptions()
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.flushTradeSubscriptions()
    }
  }

  /** Subscribe trade streams — feed tradeable mints first, then rotate extras. */
  private async rotateTradeSubscriptions() {
    if (this.ingestionPaused || !this.apiKey || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

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
    if (!mints.length) return
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'unsubscribeTokenTrade', keys: mints }))
    }
    for (const m of mints) {
      this.subscribedMints.delete(m)
      this.desiredTradeSubs.delete(m)
    }
  }

  /** Prevent unbounded desired set from reconnect churn. */
  private trimDesiredTradeSubs() {
    const maxDesired = Math.max(this.maxTradeSubscriptions + 80, 320)
    if (this.desiredTradeSubs.size <= maxDesired) return
    const keep = new Set([
      ...this.autoTrader.getPriorityMints(),
      ...this.feedTradePin.getMandatoryMints(),
      ...this.hotMints.getHotMints(100, 300_000),
      ...this.subscribedMints,
    ])
    for (const mint of this.desiredTradeSubs) {
      if (this.desiredTradeSubs.size <= maxDesired) break
      if (!keep.has(mint)) this.desiredTradeSubs.delete(mint)
    }
  }

  private queueTradeSubscription(mint: string, front = false) {
    if (!this.apiKey) return
    this.desiredTradeSubs.add(mint)
    if (this.subscribedMints.has(mint)) return
    if (
      this.subscribedMints.size >= this.maxTradeSubscriptions &&
      !this.subscribedMints.has(mint) &&
      this.pendingTradeQueue.length > 200
    ) {
      return
    }

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
    const total = this.subscribedMints.size
    const msg = `Trade subscriptions: +${batch.length} (${total}/${this.maxTradeSubscriptions})`
    const atCap = total >= this.maxTradeSubscriptions
    const now = Date.now()
    const shouldLog =
      (!atCap && (total <= 5 || total % 50 === 0)) ||
      (atCap && batch.length >= 20) ||
      (atCap && now - this.lastSubLogAt > 60_000)
    if (shouldLog) {
      this.lastSubLogAt = now
      this.logger.log(msg)
    } else {
      this.logger.debug(msg)
    }

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
    if (this.ingestionPaused || !this.apiKey) {
      return { queued: false, subscribed: false }
    }
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
    try {
      this.handleMessageUnsafe(data)
    } catch (err) {
      this.droppedMessages++
      this.logger.debug(`PumpPortal message error: ${(err as Error).message}`)
    }
  }

  private handleMessageUnsafe(data: Record<string, unknown>) {
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
    const event = {
      id: id ?? `${mint}-${Date.now()}`,
      source: 'pumpportal' as const,
      type,
      mint,
      payload,
      receivedAt: Date.now(),
    }
    try {
      await this.ingestion.processImmediate(event)
      void this.eventBus.publishRemote(event)
    } catch (err) {
      this.logger.debug(`Ingest publish failed (${type}/${mint.slice(0, 8)}): ${(err as Error).message}`)
    }
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

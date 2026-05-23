import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Inject, Logger, forwardRef } from '@nestjs/common'
import { TokensService } from '../tokens/tokens.service'
import { AutoTraderService } from '../autotrader/autotrader.service'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'
import { ChartAggregationService } from '../charts/chart-aggregation.service'
import { IngestionLeaderService } from '../ingestion/ingestion-leader.service'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'
import type { ChartUpdatePayload } from '../charts/chart-update.types'
import type {
  BubbleMapUpdatePayload,
  HolderUpdatePayload,
  MigrationUpdatePayload,
  SignalUpdatePayload,
  TokenStateChangePayload,
  WalletUpdatePayload,
} from './terminal-payloads'

export interface TradeTickPayload {
  mint: string
  signature: string
  wallet: string
  side: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  /** Ms since epoch (PumpPortal block time × 1000). */
  timestampMs: number
  slot?: number
  marketCapUsd?: number
  bondingCurvePercent?: number
  holders?: number
  holdersVerified?: boolean
}

@WebSocketGateway({ cors: { origin: '*' }, path: '/socket.io' })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(EventsGateway.name)
  private feedInterval?: NodeJS.Timeout
  constructor(
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    private autoTrader: AutoTraderService,
    @Inject(forwardRef(() => PumpPortalDataGateway))
    private pumpportal: PumpPortalDataGateway,
    private chartAgg: ChartAggregationService,
    private ingestionLeader: IngestionLeaderService,
    private redis: RedisService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`)
    if (process.env.FLY_APP_NAME) return
    if (!this.feedInterval) {
      this.feedInterval = setInterval(() => this.broadcastFeed(), 60_000)
    }
  }

  @SubscribeMessage('subscribe:feed')
  async handleFeedSubscribe(client: Socket) {
    client.join('feed')
    const epochRaw = await this.redis.get(REDIS_KEYS.streamEpoch)
    const streamEpoch = Number(epochRaw) || Date.now()
    client.emit('stream:meta', {
      epoch: streamEpoch,
      leaderId: this.ingestionLeader.getLeaderId(),
      instanceId: this.ingestionLeader.getInstanceId(),
      isLeader: this.ingestionLeader.isIngestionLeader(),
    })
    const feed = await this.tokens.getFeed('all')
    const slice = feed.slice(0, 120)
    for (const token of slice) {
      client.emit('registry:patch', token)
    }
    if (slice.length < feed.length) {
      this.logger.debug(`subscribe:feed sent ${slice.length}/${feed.length} registry patches`)
    }
  }

  @SubscribeMessage('subscribe:token')
  async handleTokenSubscribe(client: Socket, data: { mint: string }) {
    client.join(`token:${data.mint}`)
    this.pumpportal.ensureTradeSubscription(data.mint)
    const token = await this.tokens.getToken(data.mint)
    if (token) client.emit('token:update', token)
    client.emit('chart:update', this.chartAgg.getSeries(data.mint, 5_000))
    void this.tokens.warmTerminalContext(data.mint)
  }

  async broadcastFeed() {
    try {
      const feed = await this.tokens.getFeed('all')
      this.server.to('feed').emit('feed:update', feed)
    } catch (err) {
      this.logger.warn(`Feed broadcast error: ${(err as Error).message}`)
    }
  }

  emitTokenUpdate(mint: string, token: unknown) {
    this.server.to(`token:${mint}`).emit('token:update', token)
  }

  emitTradeTick(payload: TradeTickPayload) {
    this.server.to(`token:${payload.mint}`).emit('trade:tick', payload)
    this.server.to('feed').emit('trade:tick', payload)
  }

  /** Normalized registry patch — primary UI update path (stream-first). */
  emitRegistryPatch(token: unknown) {
    this.server.to('feed').emit('registry:patch', token)
    this.server.to('feed').emit('feed:patch', token)
    const mint = (token as { mint?: string })?.mint
    if (mint) {
      this.server.to(`token:${mint}`).emit('token:update', token)
    }
  }

  emitFeedPrepend(token: unknown) {
    this.server.to('feed').emit('feed:prepend', token)
  }

  /** Incremental candle patch (trade-driven). */
  emitChartDelta(payload: ChartUpdatePayload) {
    this.server.to(`token:${payload.mint}`).emit('chart:update', payload)
    this.server.to('feed').emit('chart:update', payload)
  }

  /** Full snapshot for subscribe / recovery only. */
  emitChartSnapshot(
    mint: string,
    intervalMs = 5_000,
    progression?: import('../tokens/chart.types').ProgressionPoint[],
  ) {
    const series = this.chartAgg.getSeries(mint, intervalMs, progression)
    this.server.to(`token:${mint}`).emit('chart:update', series)
  }

  /** @deprecated Use emitChartDelta — kept for analytics batch fallback */
  emitChartUpdate(
    mint: string,
    intervalMs = 5_000,
    progression?: import('../tokens/chart.types').ProgressionPoint[],
  ) {
    this.emitChartSnapshot(mint, intervalMs, progression)
  }

  emitTokenStateChange(payload: TokenStateChangePayload) {
    this.server.to(`token:${payload.mint}`).emit('token:state-change', payload)
    this.server.to('feed').emit('token:state-change', payload)
  }

  emitSignalUpdate(payload: SignalUpdatePayload) {
    this.server.to(`token:${payload.mint}`).emit('signal:update', payload)
    this.server.to('feed').emit('signal:update', payload)
  }

  emitMigrationUpdate(payload: MigrationUpdatePayload) {
    this.server.to(`token:${payload.mint}`).emit('migration:update', payload)
    this.server.to('feed').emit('migration:update', payload)
  }

  emitHolderUpdate(payload: HolderUpdatePayload) {
    this.server.to(`token:${payload.mint}`).emit('holder:update', payload)
    this.server.to('feed').emit('holder:update', payload)
  }

  emitWalletUpdate(payload: WalletUpdatePayload) {
    this.server.to(`token:${payload.mint}`).emit('wallet:update', payload)
  }

  emitBubbleMapUpdate(payload: BubbleMapUpdatePayload) {
    this.server.to(`token:${payload.mint}`).emit('bubblemap:update', payload)
  }
}

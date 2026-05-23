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
import { CHART_STREAM_EMIT_MS } from '@phronis/trading'

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
  private readonly chartLastEmit = new Map<string, number>()

  constructor(
    @Inject(forwardRef(() => TokensService))
    private tokens: TokensService,
    private autoTrader: AutoTraderService,
    @Inject(forwardRef(() => PumpPortalDataGateway))
    private pumpportal: PumpPortalDataGateway,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`)
    if (!this.feedInterval) {
      this.feedInterval = setInterval(() => this.broadcastFeed(), 8_000)
    }
  }

  @SubscribeMessage('subscribe:feed')
  async handleFeedSubscribe(client: Socket) {
    client.join('feed')
    const feed = await this.tokens.getFeed('all')
    client.emit('feed:update', feed)
  }

  @SubscribeMessage('subscribe:token')
  async handleTokenSubscribe(client: Socket, data: { mint: string }) {
    client.join(`token:${data.mint}`)
    this.pumpportal.ensureTradeSubscription(data.mint)
    const token = await this.tokens.getToken(data.mint)
    if (token) client.emit('token:update', token)
    client.emit('chart:update', this.tokens.getChartSeries(data.mint))
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

  emitChartUpdate(mint: string, intervalMs = 1_000) {
    const now = Date.now()
    const last = this.chartLastEmit.get(mint) ?? 0
    if (now - last < CHART_STREAM_EMIT_MS) return
    this.chartLastEmit.set(mint, now)
    const series = this.tokens.getChartSeries(mint, intervalMs)
    this.server.to(`token:${mint}`).emit('chart:update', series)
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { TokensService } from '../tokens/tokens.service'

@WebSocketGateway({ cors: { origin: '*' }, path: '/socket.io' })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(EventsGateway.name)
  private feedInterval?: NodeJS.Timeout

  constructor(private tokens: TokensService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`)
    if (!this.feedInterval) {
      this.feedInterval = setInterval(() => this.broadcastFeed(), 15000)
    }
  }

  @SubscribeMessage('subscribe:feed')
  async handleFeedSubscribe(client: Socket) {
    client.join('feed')
    const feed = await this.tokens.getFeed()
    client.emit('feed:update', feed)
  }

  @SubscribeMessage('subscribe:token')
  async handleTokenSubscribe(client: Socket, data: { mint: string }) {
    client.join(`token:${data.mint}`)
    const token = await this.tokens.getToken(data.mint)
    if (token) client.emit('token:update', token)
  }

  async broadcastFeed() {
    try {
      const feed = await this.tokens.getFeed()
      this.server.to('feed').emit('feed:update', feed)
    } catch (err) {
      this.logger.warn(`Feed broadcast error: ${(err as Error).message}`)
    }
  }

  emitTokenUpdate(mint: string, token: unknown) {
    this.server.to(`token:${mint}`).emit('token:update', token)
  }
}

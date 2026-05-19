import { io, type Socket } from 'socket.io-client'
import type { PumpToken, AutoTradeSignal } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL || ''

type TokenUpdateHandler = (token: PumpToken) => void
type FeedHandler = (tokens: PumpToken[]) => void
type SignalHandler = (signal: AutoTradeSignal) => void

class WebSocketService {
  private socket: Socket | null = null
  private tokenHandlers = new Set<TokenUpdateHandler>()
  private feedHandlers = new Set<FeedHandler>()
  private feedPrependHandlers = new Set<TokenUpdateHandler>()
  private feedPatchHandlers = new Set<TokenUpdateHandler>()
  private pumpPortalHandlers = new Set<TokenUpdateHandler>()
  private signalHandlers = new Set<SignalHandler>()

  connect() {
    if (this.socket?.connected) return this.socket

    this.socket = io(WS_URL || window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
    })

    this.socket.on('token:update', (token: PumpToken) => {
      this.tokenHandlers.forEach((h) => h(token))
    })

    this.socket.on('feed:update', (tokens: PumpToken[]) => {
      this.feedHandlers.forEach((h) => h(tokens))
    })

    this.socket.on('feed:prepend', (token: PumpToken) => {
      this.feedPrependHandlers.forEach((h) => h(token))
    })

    this.socket.on('feed:patch', (token: PumpToken) => {
      this.feedPatchHandlers.forEach((h) => h(token))
    })

    this.socket.on('pumpportal:newToken', (token: PumpToken) => {
      this.pumpPortalHandlers.forEach((h) => h(token))
    })

    this.socket.on('autotrader:signal', (signal: AutoTradeSignal) => {
      this.signalHandlers.forEach((h) => h(signal))
    })

    this.socket.on('connect', () => {
      this.socket?.emit('subscribe:feed')
    })

    return this.socket
  }

  subscribeToken(mint: string) {
    this.connect()
    this.socket?.emit('subscribe:token', { mint })
  }

  onTokenUpdate(handler: TokenUpdateHandler) {
    this.tokenHandlers.add(handler)
    return () => this.tokenHandlers.delete(handler)
  }

  onFeedUpdate(handler: FeedHandler) {
    this.feedHandlers.add(handler)
    return () => this.feedHandlers.delete(handler)
  }

  onFeedPrepend(handler: TokenUpdateHandler) {
    this.feedPrependHandlers.add(handler)
    return () => this.feedPrependHandlers.delete(handler)
  }

  onFeedPatch(handler: TokenUpdateHandler) {
    this.feedPatchHandlers.add(handler)
    return () => this.feedPatchHandlers.delete(handler)
  }

  onPumpPortalToken(handler: TokenUpdateHandler) {
    this.pumpPortalHandlers.add(handler)
    return () => this.pumpPortalHandlers.delete(handler)
  }

  onAutoTradeSignal(handler: SignalHandler) {
    this.signalHandlers.add(handler)
    return () => this.signalHandlers.delete(handler)
  }
}

export const wsService = new WebSocketService()

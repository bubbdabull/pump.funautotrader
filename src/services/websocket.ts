import { io, type Socket } from 'socket.io-client'
import type { PumpToken, AutoTradeSignal } from '@/types'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { QuantHolderPatch, QuantUpdate, StrategySignal } from '@/lib/quantTypes'

import { WS_URL } from '@/lib/apiConfig'
import { normalizePumpToken, normalizePumpTokens } from '@/lib/normalizeToken'

type TokenUpdateHandler = (token: PumpToken) => void
type FeedHandler = (tokens: PumpToken[]) => void
type SignalHandler = (signal: AutoTradeSignal) => void
type QuantUpdateHandler = (payload: QuantUpdate) => void
type QuantHoldersHandler = (payload: QuantHolderPatch) => void
type QuantStrategyHandler = (payload: { mint: string; signal: StrategySignal }) => void
type ChartUpdateHandler = (series: TokenChartSeries) => void

class WebSocketService {
  private socket: Socket | null = null
  private tokenHandlers = new Set<TokenUpdateHandler>()
  private feedHandlers = new Set<FeedHandler>()
  private feedPrependHandlers = new Set<TokenUpdateHandler>()
  private feedPatchHandlers = new Set<TokenUpdateHandler>()
  private pumpPortalHandlers = new Set<TokenUpdateHandler>()
  private graduatingHandlers = new Set<TokenUpdateHandler>()
  private signalHandlers = new Set<SignalHandler>()
  private quantUpdateHandlers = new Set<QuantUpdateHandler>()
  private quantHoldersHandlers = new Set<QuantHoldersHandler>()
  private quantStrategyHandlers = new Set<QuantStrategyHandler>()
  private rugWarningHandlers = new Set<(payload: { mint: string; rug: QuantUpdate['rug'] }) => void>()
  private chartHandlers = new Set<ChartUpdateHandler>()

  connect() {
    if (this.socket?.connected) return this.socket

    const url =
      WS_URL ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
    this.socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 20_000,
    })

    this.socket.on('token:update', (token: PumpToken) => {
      const t = normalizePumpToken(token)
      this.tokenHandlers.forEach((h) => h(t))
      this.feedPatchHandlers.forEach((h) => h(t))
    })

    this.socket.on('chart:update', (series: TokenChartSeries) => {
      this.chartHandlers.forEach((h) => h(series))
    })

    this.socket.on('feed:update', (tokens: PumpToken[]) => {
      const list = normalizePumpTokens(tokens)
      this.feedHandlers.forEach((h) => h(list))
    })

    this.socket.on('feed:prepend', (token: PumpToken) => {
      const t = normalizePumpToken(token)
      this.feedPrependHandlers.forEach((h) => h(t))
    })

    this.socket.on('feed:patch', (token: PumpToken) => {
      const t = normalizePumpToken(token)
      this.feedPatchHandlers.forEach((h) => h(t))
    })

    this.socket.on('pumpportal:newToken', (token: PumpToken) => {
      const t = normalizePumpToken(token)
      this.pumpPortalHandlers.forEach((h) => h(t))
    })

    this.socket.on('autotrader:signal', (signal: AutoTradeSignal) => {
      this.signalHandlers.forEach((h) => h(signal))
    })

    this.socket.on('token:graduating', (token: PumpToken) => {
      const t = normalizePumpToken(token)
      this.graduatingHandlers.forEach((h) => h(t))
    })

    this.socket.on('quant:update', (payload: QuantUpdate) => {
      this.quantUpdateHandlers.forEach((h) => h(payload))
    })

    this.socket.on('quant:holders', (payload: QuantHolderPatch) => {
      this.quantHoldersHandlers.forEach((h) => h(payload))
    })

    this.socket.on('quant:strategy', (payload: { mint: string; signal: StrategySignal }) => {
      this.quantStrategyHandlers.forEach((h) => h(payload))
    })

    this.socket.on('quant:rug_warning', (payload: { mint: string; rug: QuantUpdate['rug'] }) => {
      this.rugWarningHandlers.forEach((h) => h(payload))
    })

    this.socket.on('connect', () => {
      this.socket?.emit('subscribe:feed')
    })

    this.socket.on('connect_error', (err) => {
      console.warn('[socket.io] connect_error', err.message, 'url=', url)
    })

    return this.socket
  }

  get connected() {
    return Boolean(this.socket?.connected)
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

  onTokenGraduating(handler: TokenUpdateHandler) {
    this.graduatingHandlers.add(handler)
    return () => this.graduatingHandlers.delete(handler)
  }

  onAutoTradeSignal(handler: SignalHandler) {
    this.signalHandlers.add(handler)
    return () => this.signalHandlers.delete(handler)
  }

  onQuantUpdate(handler: QuantUpdateHandler) {
    this.quantUpdateHandlers.add(handler)
    return () => this.quantUpdateHandlers.delete(handler)
  }

  onQuantHolders(handler: QuantHoldersHandler) {
    this.quantHoldersHandlers.add(handler)
    return () => this.quantHoldersHandlers.delete(handler)
  }

  onQuantStrategy(handler: QuantStrategyHandler) {
    this.quantStrategyHandlers.add(handler)
    return () => this.quantStrategyHandlers.delete(handler)
  }

  onRugWarning(handler: (payload: { mint: string; rug: QuantUpdate['rug'] }) => void) {
    this.rugWarningHandlers.add(handler)
    return () => this.rugWarningHandlers.delete(handler)
  }

  onChartUpdate(handler: ChartUpdateHandler) {
    this.chartHandlers.add(handler)
    return () => this.chartHandlers.delete(handler)
  }
}

export const wsService = new WebSocketService()

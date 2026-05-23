import { io, type Socket } from 'socket.io-client'
import type { PumpToken, AutoTradeSignal } from '@/types'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import type { QuantHolderPatch, QuantUpdate, StrategySignal } from '@/lib/quantTypes'
import type {
  BubbleMapUpdatePayload,
  HolderUpdatePayload,
  MigrationUpdatePayload,
  SignalUpdatePayload,
  TokenStateChangePayload,
  WalletUpdatePayload,
} from '@/lib/terminalTypes'

import { WS_URL } from '@/lib/apiConfig'

type TokenUpdateHandler = (token: PumpToken) => void
type FeedHandler = (tokens: PumpToken[]) => void
type SignalHandler = (signal: AutoTradeSignal) => void
type QuantUpdateHandler = (payload: QuantUpdate) => void
type QuantHoldersHandler = (payload: QuantHolderPatch) => void
type QuantStrategyHandler = (payload: { mint: string; signal: StrategySignal }) => void
type ChartUpdateHandler = (series: TokenChartSeries) => void
type TradeTickHandler = (tick: TradeTickPayload) => void

class WebSocketService {
  private socket: Socket | null = null
  private tokenHandlers = new Set<TokenUpdateHandler>()
  private feedHandlers = new Set<FeedHandler>()
  private graduatingFeedHandlers = new Set<FeedHandler>()
  private feedPrependHandlers = new Set<TokenUpdateHandler>()
  private feedPatchHandlers = new Set<TokenUpdateHandler>()
  private registryPatchHandlers = new Set<TokenUpdateHandler>()
  private pumpPortalHandlers = new Set<TokenUpdateHandler>()
  private graduatingHandlers = new Set<TokenUpdateHandler>()
  private signalHandlers = new Set<SignalHandler>()
  private quantUpdateHandlers = new Set<QuantUpdateHandler>()
  private quantHoldersHandlers = new Set<QuantHoldersHandler>()
  private quantStrategyHandlers = new Set<QuantStrategyHandler>()
  private rugWarningHandlers = new Set<(payload: { mint: string; rug: QuantUpdate['rug'] }) => void>()
  private chartHandlers = new Set<ChartUpdateHandler>()
  private tradeTickHandlers = new Set<TradeTickHandler>()
  private stateChangeHandlers = new Set<(p: TokenStateChangePayload) => void>()
  private signalUpdateHandlers = new Set<(p: SignalUpdatePayload) => void>()
  private migrationHandlers = new Set<(p: MigrationUpdatePayload) => void>()
  private holderHandlers = new Set<(p: HolderUpdatePayload) => void>()
  private walletHandlers = new Set<(p: WalletUpdatePayload) => void>()
  private bubbleMapHandlers = new Set<(p: BubbleMapUpdatePayload) => void>()

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

    const patch = (token: PumpToken) => {
      this.tokenHandlers.forEach((h) => h(token))
      this.feedPatchHandlers.forEach((h) => h(token))
      this.registryPatchHandlers.forEach((h) => h(token))
    }

    this.socket.on('token:update', patch)
    this.socket.on('feed:patch', (t) => this.feedPatchHandlers.forEach((h) => h(t)))
    this.socket.on('registry:patch', (t) => this.registryPatchHandlers.forEach((h) => h(t)))

    this.socket.on('chart:update', (series: TokenChartSeries) => {
      this.chartHandlers.forEach((h) => h(series))
    })

    this.socket.on('trade:tick', (tick: TradeTickPayload) => {
      this.tradeTickHandlers.forEach((h) => h(tick))
    })

    this.socket.on('feed:update', (tokens: PumpToken[]) => {
      this.feedHandlers.forEach((h) => h(tokens))
    })

    this.socket.on('feed:graduating', (tokens: PumpToken[]) => {
      this.graduatingFeedHandlers.forEach((h) => h(tokens))
    })

    this.socket.on('feed:prepend', (token: PumpToken) => {
      this.feedPrependHandlers.forEach((h) => h(token))
    })

    this.socket.on('pumpportal:newToken', (token: PumpToken) => {
      this.pumpPortalHandlers.forEach((h) => h(token))
    })

    this.socket.on('autotrader:signal', (signal: AutoTradeSignal) => {
      this.signalHandlers.forEach((h) => h(signal))
    })

    this.socket.on('token:graduating', (token: PumpToken) => {
      this.graduatingHandlers.forEach((h) => h(token))
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

    this.socket.on('token:state-change', (p: TokenStateChangePayload) => {
      this.stateChangeHandlers.forEach((h) => h(p))
    })

    this.socket.on('signal:update', (p: SignalUpdatePayload) => {
      this.signalUpdateHandlers.forEach((h) => h(p))
    })

    this.socket.on('migration:update', (p: MigrationUpdatePayload) => {
      this.migrationHandlers.forEach((h) => h(p))
    })

    this.socket.on('holder:update', (p: HolderUpdatePayload) => {
      this.holderHandlers.forEach((h) => h(p))
    })

    this.socket.on('wallet:update', (p: WalletUpdatePayload) => {
      this.walletHandlers.forEach((h) => h(p))
    })

    this.socket.on('bubblemap:update', (p: BubbleMapUpdatePayload) => {
      this.bubbleMapHandlers.forEach((h) => h(p))
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

  onFeedGraduating(handler: FeedHandler) {
    this.graduatingFeedHandlers.add(handler)
    return () => this.graduatingFeedHandlers.delete(handler)
  }

  onFeedPrepend(handler: TokenUpdateHandler) {
    this.feedPrependHandlers.add(handler)
    return () => this.feedPrependHandlers.delete(handler)
  }

  onFeedPatch(handler: TokenUpdateHandler) {
    this.feedPatchHandlers.add(handler)
    return () => this.feedPatchHandlers.delete(handler)
  }

  onRegistryPatch(handler: TokenUpdateHandler) {
    this.registryPatchHandlers.add(handler)
    return () => this.registryPatchHandlers.delete(handler)
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

  onTradeTick(handler: TradeTickHandler) {
    this.tradeTickHandlers.add(handler)
    return () => this.tradeTickHandlers.delete(handler)
  }

  onTokenStateChange(handler: (p: TokenStateChangePayload) => void) {
    this.stateChangeHandlers.add(handler)
    return () => this.stateChangeHandlers.delete(handler)
  }

  onSignalUpdate(handler: (p: SignalUpdatePayload) => void) {
    this.signalUpdateHandlers.add(handler)
    return () => this.signalUpdateHandlers.delete(handler)
  }

  onMigrationUpdate(handler: (p: MigrationUpdatePayload) => void) {
    this.migrationHandlers.add(handler)
    return () => this.migrationHandlers.delete(handler)
  }

  onHolderUpdate(handler: (p: HolderUpdatePayload) => void) {
    this.holderHandlers.add(handler)
    return () => this.holderHandlers.delete(handler)
  }

  onWalletUpdate(handler: (p: WalletUpdatePayload) => void) {
    this.walletHandlers.add(handler)
    return () => this.walletHandlers.delete(handler)
  }

  onBubbleMapUpdate(handler: (p: BubbleMapUpdatePayload) => void) {
    this.bubbleMapHandlers.add(handler)
    return () => this.bubbleMapHandlers.delete(handler)
  }
}

export const wsService = new WebSocketService()

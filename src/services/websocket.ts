import { io, type Socket } from 'socket.io-client'
import type { PumpToken, AutoTradeSignal } from '@/types'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import type {
  HolderUpdatePayload,
  MigrationUpdatePayload,
  SignalUpdatePayload,
  TokenStateChangePayload,
  WalletUpdatePayload,
} from '@/lib/terminalTypes'
import { registryDebug } from '@/lib/registryDebug'
import { WS_URL } from '@/lib/apiConfig'

type RegistryPatchHandler = (token: PumpToken) => void
type FeedSnapshotHandler = (tokens: PumpToken[]) => void
type ChartHandler = (series: TokenChartSeries) => void
type TradeTickHandler = (tick: TradeTickPayload) => void
type SignalHandler = (signal: AutoTradeSignal) => void

const CANONICAL_EVENTS = [
  'registry:patch',
  'trade:tick',
  'chart:update',
  'token:state-change',
  'signal:update',
  'migration:update',
  'holder:update',
  'wallet:update',
] as const

class WebSocketService {
  private socket: Socket | null = null
  private registryPatchHandlers = new Set<RegistryPatchHandler>()
  private feedSnapshotHandlers = new Set<FeedSnapshotHandler>()
  private chartHandlers = new Set<ChartHandler>()
  private tradeTickHandlers = new Set<TradeTickHandler>()
  private stateChangeHandlers = new Set<(p: TokenStateChangePayload) => void>()
  private signalUpdateHandlers = new Set<(p: SignalUpdatePayload) => void>()
  private migrationHandlers = new Set<(p: MigrationUpdatePayload) => void>()
  private holderHandlers = new Set<(p: HolderUpdatePayload) => void>()
  private walletHandlers = new Set<(p: WalletUpdatePayload) => void>()
  private autotraderHandlers = new Set<SignalHandler>()
  private connectHandlers = new Set<() => void>()
  private disconnectHandlers = new Set<() => void>()

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

    for (const event of CANONICAL_EVENTS) {
      this.socket.on(event, (payload: unknown) => {
        registryDebug.event(event, payload)
        this.dispatch(event, payload)
      })
    }

    this.socket.on('feed:update', (payload: unknown) => {
      registryDebug.event('feed:update', { count: Array.isArray(payload) ? payload.length : 0 })
      const tokens = Array.isArray(payload) ? (payload as PumpToken[]) : []
      this.feedSnapshotHandlers.forEach((h) => h(tokens))
    })

    this.socket.on('feed:patch', (token: PumpToken) => {
      registryDebug.event('feed:patch', token?.mint)
      this.registryPatchHandlers.forEach((h) => h(token))
    })

    this.socket.on('feed:prepend', (token: PumpToken) => {
      registryDebug.event('feed:prepend', token?.mint)
      this.registryPatchHandlers.forEach((h) => h(token))
    })

    this.socket.on('token:update', (token: PumpToken) => {
      registryDebug.event('token:update', token?.mint)
      this.registryPatchHandlers.forEach((h) => h(token))
    })

    this.socket.on('autotrader:signal', (signal: AutoTradeSignal) => {
      registryDebug.event('autotrader:signal')
      this.autotraderHandlers.forEach((h) => h(signal))
    })

    this.socket.on('connect', () => {
      registryDebug.event('connect')
      this.socket?.emit('subscribe:feed')
      this.connectHandlers.forEach((h) => h())
    })

    this.socket.on('disconnect', () => {
      registryDebug.event('disconnect')
      this.disconnectHandlers.forEach((h) => h())
    })

    this.socket.on('connect_error', (err) => {
      console.warn('[socket.io] connect_error', err.message, 'url=', url)
    })

    return this.socket
  }

  private dispatch(event: (typeof CANONICAL_EVENTS)[number], payload: unknown) {
    switch (event) {
      case 'registry:patch':
        this.registryPatchHandlers.forEach((h) => h(payload as PumpToken))
        break
      case 'trade:tick':
        this.tradeTickHandlers.forEach((h) => h(payload as TradeTickPayload))
        break
      case 'chart:update':
        this.chartHandlers.forEach((h) => h(payload as TokenChartSeries))
        break
      case 'token:state-change':
        this.stateChangeHandlers.forEach((h) => h(payload as TokenStateChangePayload))
        break
      case 'signal:update':
        this.signalUpdateHandlers.forEach((h) => h(payload as SignalUpdatePayload))
        break
      case 'migration:update':
        this.migrationHandlers.forEach((h) => h(payload as MigrationUpdatePayload))
        break
      case 'holder:update':
        this.holderHandlers.forEach((h) => h(payload as HolderUpdatePayload))
        break
      case 'wallet:update':
        this.walletHandlers.forEach((h) => h(payload as WalletUpdatePayload))
        break
    }
  }

  get connected() {
    return Boolean(this.socket?.connected)
  }

  subscribeToken(mint: string) {
    this.connect()
    this.socket?.emit('subscribe:token', { mint })
  }

  onConnect(handler: () => void) {
    this.connectHandlers.add(handler)
    return () => this.connectHandlers.delete(handler)
  }

  onDisconnect(handler: () => void) {
    this.disconnectHandlers.add(handler)
    return () => this.disconnectHandlers.delete(handler)
  }

  onRegistryPatch(handler: RegistryPatchHandler) {
    this.registryPatchHandlers.add(handler)
    return () => this.registryPatchHandlers.delete(handler)
  }

  onFeedSnapshot(handler: FeedSnapshotHandler) {
    this.feedSnapshotHandlers.add(handler)
    return () => this.feedSnapshotHandlers.delete(handler)
  }

  onChartUpdate(handler: ChartHandler) {
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

  onAutoTradeSignal(handler: SignalHandler) {
    this.autotraderHandlers.add(handler)
    return () => this.autotraderHandlers.delete(handler)
  }
}

export const wsService = new WebSocketService()
